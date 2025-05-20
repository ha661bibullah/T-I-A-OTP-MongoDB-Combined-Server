// models/Otp.js - OTP মডেল
const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    otp: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300 // 5 মিনিট পরে মেয়াদ শেষ হবে
    },
    attempts: {
        type: Number,
        default: 0
    }
});

const Otp = mongoose.model('Otp', otpSchema);

module.exports = Otp;