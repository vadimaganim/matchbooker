import { User, IUser } from './models/user.model';
import TelegramBot from 'node-telegram-bot-api';

// Function to share the photo to the group
export async function sharePhotoToGroup(bot: TelegramBot, user: IUser): Promise<boolean> {
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID

  try {
    if (!TARGET_GROUP_ID) {
      console.error('No target group ID configured');
      return false;
    }

    if (!user.photoId) {
      console.error('No photo ID available for user:', user.telegramId);
      return false;
    }

    // Option 1: Share directly using the photo ID from Telegram
    const caption = `New registration from: ${user.name}`;
    await bot.sendPhoto(TARGET_GROUP_ID, user.photoId, { caption });
    
    // Update user record to mark as shared
    await User.findByIdAndUpdate(user._id, { sharedToGroup: true });
    return true;
  } catch (error) {
    console.error('Error sharing photo to group:', error);
    return false;
  }
}