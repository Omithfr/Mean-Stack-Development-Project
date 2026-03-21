const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); 

const app = express();
app.use(cors());
app.use(express.json());

// Host the static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 🚀 UPGRADED: Cloud Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aurumDB';

mongoose.connect(MONGODB_URI)
  .then(() => {
      console.log('✅ MongoDB Connected to AurumDB');
      Log.countDocuments().then(count => {
          if (count === 0) {
              Log.insertMany([
                  { action: 'System Initialization', details: 'Aurum Dashboard booted successfully.' },
                  { action: 'API Check', details: 'Connected to Frankfurter global exchange rates.' }
              ]).then(() => {
                  console.log('🌱 Auto-seeded database.');
                  syncCSV(); 
              });
          }
      });
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// MONGODB SCHEMAS
// ==========================================
const LogSchema = new mongoose.Schema({ action: String, details: String, timestamp: { type: Date, default: Date.now } });
const Log = mongoose.model('Log', LogSchema);

const UserSchema = new mongoose.Schema({ name: String, number: String, email: { type: String, unique: true }, password: String });
const User = mongoose.model('User', UserSchema);

const OrderSchema = new mongoose.Schema({ 
    userName: String, 
    email: String, 
    quantity: Number, 
    purity: String,
    shape: String,
    totalCostINR: Number, 
    status: { type: String, default: 'Pending Validation' },
    adminNote: { type: String, default: '' },
    userNote: { type: String, default: '' }, 
    timestamp: { type: Date, default: Date.now } 
});
const Order = mongoose.model('Order', OrderSchema);

// ==========================================
// CSV SYNC ENGINE
// ==========================================
const syncCSV = async () => {
    try {
        const logs = await Log.find().sort({ timestamp: -1 });
        let csvContent = '"Timestamp","Action","Details"\n';
        logs.forEach(log => {
            const safeDetails = log.details.replace(/"/g, '""'); 
            const safeAction = log.action.replace(/"/g, '""');
            csvContent += `"${log.timestamp}","${safeAction}","${safeDetails}"\n`;
        });
        fs.writeFileSync(path.join(__dirname, 'user_logs.csv'), csvContent);
    } catch(err) {
        console.error("Failed to sync CSV:", err);
    }
};

// ==========================================
// 1. LIVE MARKET API ENDPOINT
// ==========================================
app.get('/api/live-market', async (req, res) => {
    try {
        const currencyResponse = await axios.get('https://api.frankfurter.dev/v1/latest?base=USD');
        const liveRates = currencyResponse.data.rates;
        liveRates['USD'] = 1; 

        const goldResponse = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/GC=F');
        const pricePerOzUSD = goldResponse.data.chart.result[0].meta.regularMarketPrice;
        const pricePerGramUSD = pricePerOzUSD / 31.1034768;
        const pricePerGramINR = (pricePerGramUSD * liveRates['INR']) * 1.18;

        res.json({ rates: liveRates, pricePerGramINR: pricePerGramINR, pricePerOzUSD: pricePerOzUSD });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch live market data" });
    }
});

// ==========================================
// 2. TRADING & USER APIs
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        if (/[0-9]/.test(req.body.name)) {
            return res.status(400).json({ error: "Full Name cannot contain numbers." });
        }
        let emailPrefix = req.body.email.split('@')[0];
        if (!/[a-zA-Z]/.test(emailPrefix)) {
            return res.status(400).json({ error: "Email prefix must contain letters." });
        }

        const newUser = new User(req.body);
        await newUser.save();
        res.status(200).json({ message: "Registration successful!", user: newUser });
    } catch (error) {
        res.status(400).json({ error: "Email already exists or invalid data." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) return res.status(404).json({ error: "Email is not registered yet." });
        if (user.password !== req.body.password) return res.status(401).json({ error: "Incorrect password." });
        res.status(200).json({ message: "Login successful", user: user });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/buy', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.status(200).json({ message: "Purchase successful! Added to your Vault.", order: newOrder });
    } catch (error) {
        res.status(500).json({ error: "Transaction failed" });
    }
});

app.post('/api/user-orders-fetch', async (req, res) => {
    try {
        const userOrders = await Order.find({ email: req.body.email }).sort({ timestamp: -1 });
        res.status(200).json(userOrders);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user orders" });
    }
});

app.put('/api/orders/:id/user-note', async (req, res) => {
    try {
        const { note } = req.body;
        const order = await Order.findById(req.params.id);
        const updatedNote = order.userNote ? order.userNote + " | [Reply]: " + note : note;
        
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { userNote: updatedNote }, 
            { new: true }
        );
        res.status(200).json(updatedOrder);
    } catch (error) {
        res.status(500).json({ error: "Failed to add user note" });
    }
});

// ==========================================
// 3. ADMIN & CRUD APIs
// ==========================================
app.post('/api/admin-login', (req, res) => {
    if(req.body.password === 'admin123') res.status(200).json({ success: true });
    else res.status(401).json({ success: false });
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password').sort({ _id: -1 });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ timestamp: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { status, note } = req.body;
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { status: status, adminNote: note }, 
            { new: true }
        );
        res.status(200).json(updatedOrder);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

app.post('/api/log', async (req, res) => {
    const { action, details } = req.body;
    try {
        const newLog = new Log({ action, details });
        await newLog.save();
        await syncCSV(); 
        res.status(201).json(newLog);
    } catch (error) {
        res.status(500).json({ error: "Failed to log data" });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ timestamp: -1 }); 
        res.status(200).json(logs);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch logs" });
    }
});

app.put('/api/logs/:id', async (req, res) => {
    try {
        const updatedLog = await Log.findByIdAndUpdate(req.params.id, { action: req.body.action, details: req.body.details }, { new: true });
        await syncCSV(); 
        res.status(200).json(updatedLog);
    } catch (error) {
        res.status(500).json({ error: "Failed to update log" });
    }
});

app.delete('/api/logs/:id', async (req, res) => {
    try {
        await Log.findByIdAndDelete(req.params.id);
        await syncCSV(); 
        res.status(200).json({ message: "Successfully deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete log" });
    }
});

// 🚀 UPGRADED: Dynamic Port binding for Render deployment
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Aurum Backend running on port ${PORT}`);
});
