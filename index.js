import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import passport from 'passport';
import config from './config/database';

const app = express();
const port = process.env.PORT || 8000;


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(morgan('dev'));
app.use(passport.initialize());

mongoose.connect(config.database);

require('./config/passport')(passport);
require('./routes')(app, passport);

app.listen(port);

if (process.env.PORT === undefined) {
    console.log("Server Started at port : " + 8000);
}
else {
    console.log("Server Started at port : " + process.env.PORT);
}