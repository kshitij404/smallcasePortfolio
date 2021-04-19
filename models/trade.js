const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);
const mongoose = require('mongoose');

//schema for a trade
const tradeSchema = new mongoose.Schema({
    tickerSymbol:{
        type:String,
        required:"Ticker Symbol is required to log a trade",
        minlength:3,
        maxlength:10,
        
    },
    shares:{
        type:Number,
        required:"Please enter the number of shares.",
        validate:{
            validator:function(v){
                return v>0;
            },
            message:"Number of shares cannot be negative or zero."
        }
    },
    price:{
        type:Number,
        required:"Please enter the price.",
        validate:{
            validator:function(v){
                return v>0;
            },
            message:"Price cannot be negative or zero."
        }
    },
    tradeType:{
        type:String,
        enum:['buy', 'sell'],
        default:'buy'
    },
});

//model 
const Trade = mongoose.model('trade', tradeSchema);

//validation function using Joi
function validateTrade(trade){
    const schema = Joi.object({
        _id:Joi.required(),
        tickerSymbol:Joi.string().min(3).max(10).required(),
        shares: Joi.number().integer().min(1).required(),
        price: Joi.number().min(0.01).required(),
        tradeType:Joi.string().valid('buy', 'sell').required()
    });

    return schema.validate(trade._doc);
}

module.exports.Trade = Trade;
module.exports.tradeSchema = tradeSchema;
module.exports.validate = validateTrade;
