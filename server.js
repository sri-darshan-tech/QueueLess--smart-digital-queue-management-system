const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app =express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

// In-Memory Database (Easily replaceable with MongoDB or Firebase Firestore)
let queueState = {
  tokens: [
    { id: '1', tokenNumber: 'A-041', service: 'Fee Enquiry', status: 'Completed', counter: 'Counter 1', priority: false, timestamp: Date.now() - 600000 },
    { id: '2', tokenNumber: 'A-042', service: 'Certificate Request', status: 'Serving', counter: 'Counter 1', priority: false, timestamp: Date.now() - 400000 },
    { id: '3', tokenNumber: 'A-043', service: 'Bonafide Request', status: 'Waiting', counter: 'Counter 1', priority: false, timestamp: Date.now() - 300000 },
    { id: '4', tokenNumber: 'A-044', service: 'Fee Enquiry', status: 'Waiting', counter: 'Counter 2', priority: true, timestamp: Date.now() - 200000 },
    { id: '5', tokenNumber: 'A-045', service: 'OD Request', status: 'Waiting', counter: 'Counter 2', priority: false, timestamp: Date.now() - 100000 }
  ],
  counters: [
    { id: 1, name: 'Counter 1', status: 'Open', currentToken: 'A-042' },
    { id: 2, name: 'Counter 2', status: 'Open', currentToken: null },
    { id: 3, name: 'Counter 3', status: 'Closed', currentToken: null }
  ],
  stats: {
    servedToday: 124,
    avgWaitTime: 3.2
  }
};

// Helper function to broadcast updated state to all connected clients
function broadcastState() {
  io.emit('queueUpdate', queueState);
}

// REST API Endpoints

// 1. Get entire queue state
app.get('/api/queue', (req, res) => {
  res.json(queueState);
});

// 2. Create a new token (User side)
app.post('/api/tokens', (req, res) => {
  const { service, organization, userName, phone } = req.body;
  
  // Generate token number e.g., A-046
  const nextNum = queueState.tokens.length + 41;
  const tokenNumber = `A-${String(nextNum).padStart(3, '0')}`;

  const newToken = {
    id: Date.now().toString(),
    tokenNumber,
    service: service || 'General Enquiry',
    organization: organization || 'College',
    userName: userName || 'Guest',
    phone: phone || '',
    status: 'Waiting',
    counter: 'Unassigned',
    priority: false,
    timestamp: Date.now()
  };

  queueState.tokens.push(newToken);
  broadcastState();

  res.status(201).json({ success: true, token: newToken });
});

// 3. Admin action: Update token status (Call Next, Skip, Complete, Priority)
app.patch('/api/tokens/:id', (req, res) => {
  const { id } = req.params;
  const { status, counter, priority } = req.body;

  const token = queueState.tokens.find(t => t.id === id);
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }

  if (status !== undefined) token.status = status;
  if (counter !== undefined) token.counter = counter;
  if (priority !== undefined) token.priority = priority;

  if (status === 'Completed') {
    queueState.stats.servedToday += 1;
  }

  broadcastState();
  res.json({ success: true, token });
});

// 4. Admin action: Toggle counter status
app.patch('/api/counters/:id', (req, res) => {
  const { id } = req.params;
  const { status, currentToken } = req.body;

  const counter = queueState.counters.find(c => c.id == id);
  if (!counter) {
    return res.status(404).json({ error: 'Counter not found' });
  }

  if (status !== undefined) counter.status = status;
  if (currentToken !== undefined) counter.currentToken = currentToken;

  broadcastState();
  res.json({ success: true, counter });
});

// 5. Reset queue (Demo Mode)
app.post('/api/reset', (req, res) => {
  queueState.tokens = [];
  queueState.counters.forEach(c => c.currentToken = null);
  queueState.stats.servedToday = 0;
  broadcastState();
  res.json({ success: true, message: 'Queue reset successfully' });
});

// Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial state upon connection
  socket.emit('queueUpdate', queueState);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`QueueLess backend server running on port ${PORT}`);
});