const currencyPairs = require('lib/poloniex/currencyPairs');
const Joi = require('joi');
const User = require('db/models/User');
const Order = require('db/models/Order');
const mongoose = require('mongoose');

exports.createOrder = async (ctx) => {
  const {
    currencyPair,
    price,
    amount,
    sell
  } = ctx.request.body;

  const { user } = ctx.request;

  // needs auth
  if(!user) {
    ctx.status = 401;
    return;
  }

  // check schema
  const schema = Joi.object({
    currencyPair: Joi.string().required(),
    price: Joi.number().greater(0).required(),
    amount: Joi.number().greater(0).required(),
    sell: Joi.boolean().required()
  });

  const result = Joi.validate(ctx.request.body, schema);
  if(result.error) {
    ctx.status = 400;
    ctx.body = result.error;
    return;
  }
    
  // check currencyPair existancy
  if(currencyPairs.indexOf(currencyPair) === -1) {
    ctx.status = 400;
    ctx.body = {
      msg: 'invalid currencypair'
    };
    return;
  }

  const totalAmount = price * amount;

  try {
    const userData = await User.findById(user._id).exec();
    const { wallet, walletOnOrder } = userData;
    const baseCurrency = (() => {
      if(currencyPair === 'USDT_BTC') {
        return sell ? 'BTC' : 'USDT';
      }
      return sell ? currencyPair.split('_')[1] : 'BTC';
    })();

    if(totalAmount > (wallet[baseCurrency] || 0)) {
      ctx.status = 400;
      ctx.body = {
        msg: 'totalamount exceeds'
      };
      return;
    }
    
    // create order
    const order = new Order({
      userId: mongoose.Types.ObjectId(user._id),
      currencyPair,
      price,
      amount,
      sell
    });

    // different approach depending value existancy
    if(walletOnOrder[baseCurrency] === undefined) {
      await User.findByIdAndUpdate(user._id, {
        $inc: {
          [`wallet.${baseCurrency}`]: -1 * totalAmount
        },
        $set: {
          [`walletOnOrder.${baseCurrency}`]: totalAmount
        }
      }).exec();
    } else {
      await User.findByIdAndUpdate(user._id, {
        $inc: {
          [`wallet.${baseCurrency}`]: -1 * totalAmount,
          [`walletOnOrder.${baseCurrency}`]: totalAmount
        }
      }).exec();
    }

    await order.save();
    ctx.body = {
      order
    };
  } catch (e) {

  }
};