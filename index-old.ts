// Required packages
import TelegramBot from 'node-telegram-bot-api';
// import * as https from 'https';
// import { config } from 'dotenv';
import 'dotenv/config';
import { connectDb } from './services/db.service';
import { User, IUser } from './models/user.model';

// Initialize config
// config();

// MongoDB connection
connectDb()
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  });

// Bot configuration
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID; // ID of the group where photos will be shared

// Define types for user states
interface UserState {
  state: string | null;
  userId?: string;
}

// Bot state management
const userStates: Record<number, UserState> = {};

// Command: Start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to the registration bot! Please send your name.');
  userStates[chatId] = { state: 'WAITING_FOR_NAME' };
});

// Command: Help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'This bot collects your name and photo for registration.\n\nCommands:\n/start - Begin registration\n/help - Show this help\n/status - Check your registration status\n/getphoto - View your stored photo');
});

// Command: Status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg?.from?.id;
  
  try {
    const user = await User.findOne({ telegramId });
    if (user) {
      let statusMessage = `Your registration status:\n- Name: ${user.name || 'Not provided'}`;
      statusMessage += user.photoBase64 ? '\n- Photo: Uploaded and stored in database' : '\n- Photo: Not uploaded';
      statusMessage += user.sharedToGroup ? '\n- Photo has been shared to the group' : '';
      bot.sendMessage(chatId, statusMessage);
    } else {
      bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin registration.');
    }
  } catch (error) {
    console.error('Error checking user status:', error);
    bot.sendMessage(chatId, 'Error checking your status. Please try again.');
  }
});

// Function to download photo from Telegram and convert to base64
// async function getPhotoBase64(fileUrl: string): Promise<string> {
//   return new Promise((resolve, reject) => {
//     https.get(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileUrl}`, (response) => {
//       if (response.statusCode !== 200) {
//         reject(new Error(`Failed to download file: ${response.statusCode}`));
//         return;
//       }

//       const chunks: Buffer[] = [];
      
//       response.on('data', (chunk: Buffer) => {
//         chunks.push(chunk);
//       });
      
//       response.on('end', () => {
//         const buffer = Buffer.concat(chunks);
//         const base64String = buffer.toString('base64');
//         resolve(base64String);
//       });
      
//       response.on('error', (err) => {
//         reject(err);
//       });
//     }).on('error', (err) => {
//       reject(err);
//     });
//   });
// }

// Define User document interface (should match your actual User model)
// interface IUser {
//   _id: string;
//   telegramId: number;
//   name?: string;
//   photoId?: string;
//   photoBase64?: string;
//   photoMimeType?: string;
//   sharedToGroup?: boolean;
// }

// Function to share the photo to the group
async function sharePhotoToGroup(user: IUser): Promise<boolean> {
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

// Handle all messages
bot.on('message', async (msg) => {  
  const chatId = msg.chat.id;
  const telegramId = msg?.from?.id;
  console.log('Chat ID:', chatId);
  // Ignore commands
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }
  
  // Get current user state
  const userState = userStates[chatId] || { state: null };
  
  // Handle name collection
  if (userState.state === 'WAITING_FOR_NAME') {
    if (msg.text) {
      try {
        // Save/update the user with the name
        await User.findOneAndUpdate(
          { telegramId },
          { telegramId, name: msg.text },
          { upsert: true, new: true }
        );
        
        bot.sendMessage(chatId, `Thanks, ${msg.text}! Now please send your photo.`);
        userStates[chatId] = { state: 'WAITING_FOR_PHOTO' };
      } catch (error) {
        console.error('Error saving name:', error);
        bot.sendMessage(chatId, 'Error saving your name. Please try again.');
      }
    } else {
      bot.sendMessage(chatId, 'Please send your name as text.');
    }
    return;
  }
  
  // Handle photo collection
  if (userState.state === 'WAITING_FOR_PHOTO') {
    if (msg.photo) {
      try {
        bot.sendMessage(chatId, 'Processing your photo, please wait...');
        
        // Get the largest photo (last in the array)
        const photo = msg.photo[msg.photo.length - 1];
        const photoId = photo.file_id;
        
        // Get file info from Telegram
        const fileInfo = await bot.getFile(photoId);
        const filePath = fileInfo.file_path;
        
        // Get the photo as base64
        // const photoBase64 = await getPhotoBase64(filePath as string);
        
        // Update user with photo information
        const updatedUser = await User.findOneAndUpdate(
          { telegramId },
          { 
            photoId, 
            // photoBase64,
            photoMimeType: 'image/jpeg'
          },
          { new: true } // Return the updated document
        );
        
        bot.sendMessage(chatId, 'Great! Your registration is complete');
        const shared = await sharePhotoToGroup(updatedUser);
        // Ask user if they want to share their photo to the group
        // const opts = {
        //   reply_markup: {
        //     inline_keyboard: [
        //       [
        //         { text: 'Yes, share my photo', callback_data: 'share_photo' },
        //         { text: 'No, keep private', callback_data: 'keep_private' }
        //       ]
        //     ]
        //   }
        // };
        // bot.sendMessage(chatId, 'Would you like to share your photo with our community group?', opts);
        
        // Store user in state for callback processing
        // userStates[chatId] = { 
        //   state: 'WAITING_FOR_SHARE_DECISION',
        //   userId: updatedUser?._id.toString() || ''
        // };
      } catch (error) {
        console.error('Error processing photo:', error);
        bot.sendMessage(chatId, 'Error processing your photo. Please try again.');
      }
    } else {
      bot.sendMessage(chatId, 'Please send your photo.');
    }
    return;
  }
  
  // Default response for users not in a specific state
  if (!userState.state) {
    bot.sendMessage(chatId, 'Please use /start to begin registration.');
  }
});

// Handle callback queries (for the share photo button)
bot.on('callback_query', async (callbackQuery) => {
  if (!callbackQuery.message) return;
  
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const telegramId = callbackQuery.from.id;
  
  // Get current user state
  const userState = userStates[chatId] || { state: null };
  
  if (userState.state === 'WAITING_FOR_SHARE_DECISION') {
    if (data === 'share_photo') {
      try {
        const user = await User.findOne({ telegramId });
        if (!user) {
          bot.answerCallbackQuery(callbackQuery.id, { text: 'User information not found.' });
          bot.sendMessage(chatId, 'Error: User information not found.');
          return;
        }
        
        const shared = await sharePhotoToGroup(user);
        
        if (shared) {
          bot.answerCallbackQuery(callbackQuery.id, { text: 'Your photo has been shared!' });
          bot.sendMessage(chatId, 'Your photo has been successfully shared to our community group. Thank you!');
        } else {
          bot.answerCallbackQuery(callbackQuery.id, { text: 'Error sharing photo.' });
          bot.sendMessage(chatId, 'Sorry, there was an error sharing your photo. Please try again later.');
        }
      } catch (error) {
        console.error('Error in share photo callback:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Error processing request.' });
        bot.sendMessage(chatId, 'An error occurred while processing your request.');
      }
    } else if (data === 'keep_private') {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Your photo will remain private.' });
      bot.sendMessage(chatId, 'Your photo will remain private. Thank you for your registration!');
    }
    
    // Clear user state
    delete userStates[chatId];
  }
});

// Add a command to retrieve the photo
bot.onText(/\/getphoto/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg?.from?.id;
  
  try {
    const user = await User.findOne({ telegramId }, { photoBase64: 1, photoMimeType: 1, name: 1 });
    
    if (!user || !user.photoBase64) {
      bot.sendMessage(chatId, 'No photo found in the database for you.');
      return;
    }
    
    // Create a Buffer from the base64 string
    const photoBuffer = Buffer.from(user.photoBase64, 'base64');
    
    // Send the photo back to the user
    await bot.sendPhoto(chatId, photoBuffer, { caption: `Hello ${user.name}, here's your stored photo!` });
    
  } catch (error) {
    console.error('Error in getphoto command:', error);
    bot.sendMessage(chatId, 'An error occurred while retrieving your photo.');
  }
});

// Command for admins to manually share all unshared photos to the group
bot.onText(/\/shareall/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg?.from?.id;
  
  // Optional: Check if user is an admin
  // const adminIdsString = process.env.ADMIN_IDS;
  // const adminIds = adminIdsString ? adminIdsString.split(',').map(id => parseInt(id)) : [];
  
  // if (adminIds.length > 0 && !adminIds.includes(telegramId as number)) {
  //   bot.sendMessage(chatId, 'You are not authorized to use this command.');
  //   return;
  // }
  
  try {
    // Find all users with photos that haven't been shared yet
    const users = await User.find({ 
      photoId: { $exists: true, $ne: null },
      sharedToGroup: { $ne: true }
    });
    
    if (users.length === 0) {
      bot.sendMessage(chatId, 'No unshared photos found.');
      return;
    }
    
    bot.sendMessage(chatId, `Found ${users.length} photos to share. Starting process...`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Share each photo
    for (const user of users) {
      const shared = await sharePhotoToGroup(user.toObject());
      if (shared) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Add a small delay to avoid hitting Telegram API limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    bot.sendMessage(chatId, `Sharing complete. Successfully shared: ${successCount}, Failed: ${failCount}`);
    
  } catch (error) {
    console.error('Error in shareall command:', error);
    bot.sendMessage(chatId, 'An error occurred while processing your request.');
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Initialize by checking bot permissions for the target group
// (async function checkBotPermissions() {
//   if (!TARGET_GROUP_ID) {
//     console.warn('No target group ID configured. Group sharing will be disabled.');
//     return;
//   }
  
//   try {
//     const botId = bot.token.split(':')[0];
//     const chatMember = await bot.getChatMember(TARGET_GROUP_ID, botId);
//     console.log('Bot status in target group:', chatMember.status);
    
//     if (!['administrator', 'member'].includes(chatMember.status)) {
//       console.warn('Bot is not a member of the target group. Group sharing may fail.');
//     }
//   } catch (error) {
//     console.error('Error checking bot permissions:', error);
//     console.warn('Bot may not have access to the target group.');
//   }
// })();

console.log('Bot is running...');