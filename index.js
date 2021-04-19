const express = require('express');
const app = express();
const config = require('config');
const db = config.get('db');
require('./startup/prod')(app);

const mongoose = require('mongoose');
const {tradeRouter} = require('./routes/trades');
const {fetchRouter} = require('./routes/fetch');
const port = process.env.PORT || 3000;

//connect to db
mongoose.connect(db, {useNewUrlParser:true, useUnifiedTopology:true, useCreateIndex:true, useFindAndModify:false})
.then(console.log('MongoDB connected successfully.'))
.catch((err)=>console.log(err.message));

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use('/api/trade/', tradeRouter);
app.use('/api/fetch/', fetchRouter);

//listen to port
app.listen(port, ()=>{
    console.log(`Listening to port: ${port}`);
});