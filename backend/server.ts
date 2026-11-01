
import express from 'express';
import mongoose from 'mongoose';
import inventoryRoutes from './routes/inventory';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Routes
app.use('/api/inventory', inventoryRoutes);

// Database Connection (Conceptual placeholder)
const connectDB = async () => {
  try {
    // Note: Assuming a local or cloud mongo instance
    // await mongoose.connect('mongodb://localhost:27017/spectrum_pro');
    console.log('MongoDB Connected conceptually...');
  } catch (err) {
    console.error('Database connection error:', err);
  }
};

app.listen(PORT, () => {
  console.log(`Server running modularly on port ${PORT}`);
  connectDB();
});
