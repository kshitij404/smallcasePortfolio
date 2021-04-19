const mongoose = require('mongoose');
const {tradeSchema} = require('./trade');

//schema
const stockSchema = new mongoose.Schema({
    tickerSymbol:{
        type:String,
    },
    avgBuyPrice:{
        type:Number,
        default:0
    },
    shares:{
        type:Number,
        default:0
    },
    trades:{
        type:[tradeSchema],
        
    },
    
});
//model
const Stock = mongoose.model('portfolio', stockSchema);

//export
module.exports.Stock = Stock;
module.exports.stockSchema = stockSchema;