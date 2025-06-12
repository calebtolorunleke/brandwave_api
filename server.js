require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/user');
const { OAuth2Client } = require('google-auth-library');

const app = express();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const client = new OAuth2Client(CLIENT_ID);

const allowedOrigins = ['http://localhost:5173', FRONTEND_URL];

// Log incoming origin for debugging
app.use((req, res, next) => {
    console.log('Incoming request origin:', req.headers.origin);
    next();
});

// Simplified CORS setup
const corsOptions = {
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            return callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false, // set true only if you use cookies or auth headers
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Root route
app.get('/', (req, res) => {
    res.send('✅ Backend is running');
});

// Register route
app.post('/register', async (req, res) => {
    const { fullName, email, password, confirmPassword } = req.body;

    if (!fullName || !email || !password || !confirmPassword) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const newUser = new User({ fullName, email, password });
        await newUser.save();

        return res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Login route (email/password)
app.post('/login', async (req, res) => {
    console.log("🛂 Login route hit");

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }

    try {
        const user = await User.findOne({ email });

        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        return res.status(200).json({
            message: 'Login successful',
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Login failed', error: error.message });
    }
});

// Google login verification function
async function verifyGoogleToken(token) {
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: CLIENT_ID,
    });
    return ticket.getPayload();
}

// Google Login route
app.post('/google-login', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ message: 'Google token missing' });
    }

    try {
        const payload = await verifyGoogleToken(token);
        const { email, name, sub: googleId } = payload;

        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                fullName: name,
                email,
                googleId,
                password: "", // No password for Google users
            });
            await user.save();
        }

        res.status(200).json({
            message: 'Google login successful',
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
            },
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(401).json({ message: 'Invalid Google token', error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
