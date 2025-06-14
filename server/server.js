const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Message = require('./models/Message');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const activeUsers = new Map();
const typingUsers = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for Base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/livechat')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));


// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    const user = new User({ username, email, password });
    await user.save();
    
    // Create token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({ success: true, token, username });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user._id,
        username: user.username,
        avatar: user.avatar
      },
      process.env.JWT_SECRET
    );

    res.json({
      success: true,
      token,
      username: user.username,
      avatar: user.avatar
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});

app.post('/api/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(401).json({ valid: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ valid: false, message: 'User not found' });
    }
    
    res.json({ 
      valid: true, 
      username: decoded.username,
      userId: decoded.userId,
      avatar: user.avatar
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ valid: false, message: 'Invalid token' });
  }
});


const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Profile update route
app.post('/api/profile/update', authenticateToken, async (req, res) => {
  try {
    const { username, avatar } = req.body;
    console.log('Update request:', { username, userId: req.user.userId });
    
    if (!username?.trim()) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ 
      username: username.trim(),
      _id: { $ne: req.user.userId }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const updateData = {
      username: username.trim(),
      ...(avatar && { avatar })
    };

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('Updated user:', updatedUser);

    res.json({
      success: true,
      user: {
        username: updatedUser.username,
        avatar: updatedUser.avatar
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ 
      message: 'Failed to update profile',
      error: error.message 
    });
  }
});

// Socket.IO handlers with basic authentication
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.username = decoded.username;
      socket.userId = decoded.userId;
      next();
    } catch (jwtError) {
      return next(new Error('Invalid token'));
    }
  } catch (err) {
    console.error('Socket authentication error:', err);
    return next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.username} connected`);
  activeUsers.set(socket.id, socket.username);
  io.emit('userList', Array.from(activeUsers.values()));

  socket.on('join', async () => {
    try {
      const messages = await Message.find()
        .sort('-timestamp')
        .limit(50)
        .lean();
      socket.emit('messages', messages.reverse());
    } catch (error) {
      socket.emit('error', 'Error loading messages');
    }
  });

  socket.on('sendMessage', async (message) => {
    try {
      const newMessage = new Message({
        text: message.text,
        user: socket.username,
        avatar: message.avatar || '/images/image.png',
        timestamp: new Date()
      });
      
      await newMessage.save();
      io.emit('message', newMessage);
    } catch (error) {
      socket.emit('error', 'Error sending message');
    }
  });

  socket.on('typing', () => {
    typingUsers.set(socket.id, socket.username);
    socket.broadcast.emit('userTyping', { 
      username: socket.username,
      timestamp: Date.now()
    });
  });

  socket.on('stopTyping', () => {
    typingUsers.delete(socket.id);
    socket.broadcast.emit('userStoppedTyping', { 
      username: socket.username,
      timestamp: Date.now()
    });
  });


  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('userList', Array.from(activeUsers.values()));
    console.log(`User ${socket.username} disconnected`);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Available routes:');
  console.log('- POST /api/register');
  console.log('- POST /api/login');
  console.log('- POST /api/verify-token');
  console.log('- POST /api/profile/update');
});