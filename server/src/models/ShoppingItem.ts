import mongoose, { Schema } from 'mongoose';

const shoppingItemSchema = new Schema(
  {
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    department: { type: String, required: true },
    purchased: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ShoppingItemModel =
  mongoose.models.ShoppingItem ?? mongoose.model('ShoppingItem', shoppingItemSchema);
