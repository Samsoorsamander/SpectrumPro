
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  company: { type: String, required: true },
  size: { type: String, required: true },
  unit: { type: String, required: true },
  stock: { type: Number, default: 0 },
  purchasePrice: { type: Number, required: true },
  salePrice: { type: Number, required: true },
  colorHex: { type: String },
  minStockLevel: { type: Number, default: 5 },
}, { timestamps: true });

export default mongoose.model('Product', ProductSchema);
