// combined-server.js - একত্রিত সার্ভার সেটআপ
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const path = require("path");

// মডেলগুলি ইম্পোর্ট করুন
const User = require("./models/User");
const Otp = require("./models/Otp");

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB সংযোগ স্থাপন
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:Kw5FmYPNbFMtWCPS@talimulcluster.irmh5p4.mongodb.net/?retryWrites=true&w=majority&appName=TalimulCluster';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB সাথে সংযোগ স্থাপন সফল হয়েছে');
    
    // ইনডেক্স তৈরি করুন (দ্বিতীয় সার্ভার থেকে নেওয়া)
    try {
      const db = mongoose.connection.db;
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('otps').createIndex({ createdAt: 1 }, { expireAfterSeconds: 300 }); // OTPs expire after 5 minutes
      console.log('✅ ইনডেক্স তৈরি করা হয়েছে');
    } catch (err) {
      console.error('❌ ইনডেক্স তৈরিতে সমস্যা:', err);
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB সংযোগে সমস্যা:', err);
  });

// মিডলওয়্যার
app.use(cors({
    origin: '*', // প্রোডাকশনে আপনার ফ্রন্টএন্ড URL দিন
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// স্ট্যাটিক ফাইল সার্ভ করার জন্য
app.use(express.static(path.join(__dirname, 'public')));

// ইমেইল ট্রান্সপোর্টার সেটআপ
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// OTP জেনারেট করার ফাংশন
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// ইমেইল পাঠানোর ফাংশন (দ্বিতীয় সার্ভার থেকে উন্নত সংস্করণ)
async function sendOtpEmail(email, otp) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "আপনার রেজিস্ট্রেশন অটিপি কোড",
            html: `
                <div style="font-family: 'Hind Siliguri', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #6A35F2; text-align: center;">নিশ্চিতকরণ কোড</h2>
                    <p style="font-size: 16px;">প্রিয় ব্যবহারকারী,</p>
                    <p style="font-size: 16px;">আপনার অ্যাকাউন্ট নিশ্চিত করার জন্য নিচের কোডটি ব্যবহার করুন:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <div style="font-size: 30px; font-weight: bold; letter-spacing: 5px; background-color: #f4f4f4; padding: 15px; border-radius: 5px;">${otp}</div>
                    </div>
                    <p style="font-size: 16px;">এই কোডটি <strong>২ মিনিট</strong> পর্যন্ত বৈধ থাকবে।</p>
                    <p style="font-size: 14px; color: #777; margin-top: 30px;">আপনি যদি এই অনুরোধটি না করে থাকেন, তাহলে এই ইমেইল উপেক্ষা করুন।</p>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`✅ ${email} এ OTP পাঠানো হয়েছে`);
        return true;
    } catch (error) {
        console.error("❌ OTP পাঠাতে ব্যর্থ:", error);
        return false;
    }
}

// মিডলওয়্যার: ইউজার আছে কিনা চেক করুন
async function userExists(req, res, next) {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: "ইমেইল প্রদান করুন" });
    }
    
    try {
        const existingUser = await User.findOne({ email });
        req.userExists = !!existingUser;
        next();
    } catch (error) {
        console.error("❌ ইউজার চেক করার সময় ত্রুটি:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
}

// রুট: হোম পেইজ
app.get('/', (req, res) => {
    res.send('অথেনটিকেশন API চালু আছে! 🚀');
});

// রুট: সার্ভার পিংটেস্ট
app.get('/ping', (req, res) => {
    console.log('Ping request received');
    res.json({ status: 'success', message: 'Server is running!' });
});

// রুট: ইমেইল চেক এবং OTP পাঠানো (দ্বিতীয় সার্ভার থেকে)
app.post("/api/check-email", userExists, async (req, res) => {
    const { email } = req.body;
    
    if (req.userExists) {
        return res.json({ success: false, message: "এই ইমেইল দিয়ে একাউন্ট ইতিমধ্যে আছে" });
    }
    
    try {
        // OTP জেনারেট করুন
        const otp = generateOTP();
        
        // আগের OTP থাকলে মুছে ফেলুন
        await Otp.deleteMany({ email });
        
        // নতুন OTP তৈরি করুন
        await new Otp({
            email,
            otp,
            createdAt: new Date(),
            attempts: 0
        }).save();
        
        console.log(`Generated OTP for ${email}: ${otp}`);
        
        // OTP ইমেইল করুন
        const emailSent = await sendOtpEmail(email, otp);
        
        if (emailSent) {
            res.json({ success: true, message: "আপনার ইমেইলে অটিপি পাঠানো হয়েছে" });
        } else {
            res.status(500).json({ success: false, message: "অটিপি পাঠাতে সমস্যা হয়েছে" });
        }
    } catch (error) {
        console.error("❌ OTP পাঠানোর সময় ত্রুটি:", error);
        res.status(500).json({ 
            success: false, 
            message: "OTP পাঠাতে ব্যর্থ হয়েছে।",
            error: error.message
        });
    }
});

// রুট: OTP পাঠানো (প্রথম সার্ভার, ব্যাকওয়ার্ড কম্প্যাটিবিলিটির জন্য রাখা)
app.post('/api/send-otp', async (req, res) => {
    try {
        console.log('OTP send request received:', req.body);
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'ইমেইল প্রদান করা হয়নি!' });
        }
        
        // চেক করুন ইমেইল আগে থেকে আছে কিনা
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে!'
            });
        }

        // OTP জেনারেট করুন
        const otp = generateOTP();
        console.log(`Generated OTP for ${email}: ${otp}`);
        
        // আগের OTP থাকলে মুছে ফেলুন
        await Otp.deleteMany({ email });
        
        // নতুন OTP তৈরি করুন
        await new Otp({
            email,
            otp,
            createdAt: new Date(),
            attempts: 0
        }).save();

        // OTP ইমেইল করুন
        const emailSent = await sendOtpEmail(email, otp);
        
        if (emailSent) {
            res.json({ success: true, message: 'OTP সফলভাবে পাঠানো হয়েছে!' });
        } else {
            res.status(500).json({ success: false, message: 'OTP পাঠাতে ব্যর্থ হয়েছে!' });
        }
    } catch (error) {
        console.error('OTP পাঠানোর সময় ত্রুটি:', error);
        res.status(500).json({ 
            success: false, 
            message: 'OTP পাঠাতে ব্যর্থ হয়েছে।',
            error: error.message
        });
    }
});

// রুট: OTP আবার পাঠানো
app.post("/api/resend-otp", async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: "ইমেইল প্রদান করুন" });
    }
    
    try {
        // আগের OTP থাকলে মুছে ফেলুন
        await Otp.deleteMany({ email });
        
        // নতুন OTP জেনারেট করুন
        const otp = generateOTP();
        
        // নতুন OTP তৈরি করুন
        await new Otp({
            email,
            otp,
            createdAt: new Date(),
            attempts: 0
        }).save();
        
        // OTP ইমেইল করুন
        const emailSent = await sendOtpEmail(email, otp);
        
        if (emailSent) {
            res.json({ success: true, message: "নতুন অটিপি পাঠানো হয়েছে" });
        } else {
            res.status(500).json({ success: false, message: "অটিপি পাঠাতে সমস্যা হয়েছে" });
        }
    } catch (error) {
        console.error("❌ Resend OTP error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
});

// রুট: OTP যাচাই করা (উন্নত উভয় সার্ভারের মিশ্রিত সংস্করণ)
app.post('/api/verify-otp', async (req, res) => {
    try {
        console.log('OTP verification request received:', req.body);
        const { email, otp } = req.body;
        
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'ইমেইল বা OTP প্রদান করা হয়নি!' });
        }

        // ডাটাবেস থেকে OTP খুঁজুন
        const otpRecord = await Otp.findOne({ email });
        
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: 'OTP মেয়াদ শেষ হয়েছে বা বৈধ নয়!' });
        }
        
        // OTP মেয়াদ যাচাই করুন (2 মিনিট)
        const now = Date.now();
        const otpCreatedAt = new Date(otpRecord.createdAt).getTime();
        
        if (now - otpCreatedAt > 120000) {
            await Otp.deleteMany({ email });
            return res.status(400).json({ success: false, message: 'OTP মেয়াদ শেষ হয়েছে!' });
        }
        
        // প্রচেষ্টার সংখ্যা বাড়ান
        otpRecord.attempts += 1;
        await otpRecord.save();
        
        // সর্বাধিক 3টি প্রচেষ্টা
        if (otpRecord.attempts > 3) {
            await Otp.deleteMany({ email });
            return res.status(400).json({ success: false, message: 'অনেকবার ভুল চেষ্টা করা হয়েছে। আবার OTP পাঠান।' });
        }
        
        // OTP মিলে যায় কিনা
        if (otp !== otpRecord.otp) {
            return res.status(400).json({ 
                success: false, 
                message: `ভুল OTP! আবার চেষ্টা করুন। (${3 - otpRecord.attempts} চেষ্টা বাকি আছে)`
            });
        }
        
        // OTP সঠিক, স্টোরেজ থেকে মুছে ফেলুন
        await Otp.deleteMany({ email });
        console.log(`OTP verified successfully for ${email}`);
        
        res.json({ success: true, message: 'OTP সফলভাবে যাচাই করা হয়েছে!' });
    } catch (error) {
        console.error('OTP যাচাই করার সময় ত্রুটি:', error);
        res.status(500).json({ 
            success: false, 
            message: 'OTP যাচাই করতে ব্যর্থ হয়েছে।',
            error: error.message
        });
    }
});

// রুট: নতুন ইউজার রেজিস্ট্রেশন
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'সব তথ্য প্রদান করা আবশ্যক!'
            });
        }
        
        // চেক করুন ইমেইল আগে থেকে আছে কিনা
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে!'
            });
        }
        
        // পাসওয়ার্ড হ্যাশ করুন
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // নতুন ইউজার তৈরি করুন
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            createdAt: new Date()
        });
        
        await newUser.save();
        
        res.json({ 
            success: true, 
            message: 'ইউজার সফলভাবে তৈরি করা হয়েছে!',
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email
            }
        });
    } catch (error) {
        console.error('রেজিস্ট্রেশনের সময় ত্রুটি:', error);
        res.status(500).json({ 
            success: false, 
            message: 'রেজিস্ট্রেশন করতে ব্যর্থ হয়েছে।',
            error: error.message
        });
    }
});

// রুট: ইউজার লগইন
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'ইমেইল এবং পাসওয়ার্ড প্রদান করুন!'
            });
        }
        
        // ইউজার খুঁজুন
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'ভুল ইমেইল বা পাসওয়ার্ড!'
            });
        }
        
        // পাসওয়ার্ড যাচাই করুন
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'ভুল ইমেইল বা পাসওয়ার্ড!'
            });
        }
        
        // প্রোডাকশনের জন্য আপনি এখানে JWT টোকেন জেনারেট করতে পারেন
        // const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        res.json({ 
            success: true, 
            message: 'সফলভাবে লগইন করা হয়েছে!',
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
            // token: token
        });
    } catch (error) {
        console.error('লগইনের সময় ত্রুটি:', error);
        res.status(500).json({ 
            success: false, 
            message: 'লগইন করতে ব্যর্থ হয়েছে।',
            error: error.message
        });
    }
});

// কিছু বেসিক এরর হ্যান্ডলিং যোগ করুন
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: 'এই URL টি খুঁজে পাওয়া যায়নি!' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'সার্ভারে একটি ত্রুটি দেখা দিয়েছে!' });
});

// সার্ভার শ্যাটডাউন হ্যান্ডলিং (দ্বিতীয় সার্ভার থেকে)
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
});

// সার্ভার শুরু করুন
app.listen(PORT, () => {
    console.log(`🚀 সার্ভার চালু হয়েছে: http://localhost:${PORT}`);
    console.log('Environment variables loaded:', {
        PORT: PORT,
        EMAIL_USER: process.env.EMAIL_USER,
        EMAIL_PASS: process.env.EMAIL_PASS ? 'Set (hidden)' : 'Not set',
        MONGO_URI: process.env.MONGO_URI ? 'Set (hidden)' : 'Using default'
    });
});