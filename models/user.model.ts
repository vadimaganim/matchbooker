import mongoose, { Schema } from 'mongoose';

export interface IUser extends Document {
    _id: string;
    telegramId: number;
    name?: string;
    photoId?: string;
    photoBase64?: string;
    photoMimeType?: string;
    sharedToGroup?: boolean;
    registeredAt: Date;
  }
  
  const UserSchema: Schema = new Schema({
    telegramId: { type: Number, required: true, unique: true },
    name: { type: String },
    photoId: { type: String },
    photoBase64: { type: String },
    photoMimeType: { type: String, default: 'image/jpeg' },
    sharedToGroup: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now }
  });
  
  export const User = mongoose.model<IUser>('User', UserSchema);