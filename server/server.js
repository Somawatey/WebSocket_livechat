const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const Message = require('./models/Message');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Socket.io Connection
io.on('connection', async (socket) => {
    // 1. Log new connection
    console.log('New client connected');
    // 2. Fetch previous messages from MongoDB
    // 3. Send them to the new client only
    try {
        // Send previous messages to new client
        const messages = await Message.find()
            .sort({ timestamp: -1 })
            .limit(50)
            .exec();
        socket.emit('previous-messages', messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        socket.emit('error', 'Error loading messages');
    }

    // Handle new messages
    socket.on('sendMessage', async (message) => {
        try {
            const newMessage = new Message({
                text: message.text,
                user: message.user,
                timestamp: new Date()
            });
            await newMessage.save();
            io.emit('message', newMessage);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', 'Error sending message');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle server shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        mongoose.connection.close();
        console.log('Server shutdown complete');
    });
});