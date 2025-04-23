import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';
import { connectDb } from './services/db.service';
import { User, IUser } from './models/user.model';
import { UserState } from './interfaces';
import { sharePhotoToGroup } from './helper';
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
// Bot state management
const userStates: Record<number, UserState> = {};

// Command: Start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to the matchbooking bot! Please send your name and surname.');
  userStates[chatId] = { state: 'WAITING_FOR_NAME' };
});

// Command: Help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'This bot collects your name, surname and receipe photo for registration.\n\nCommands:\n/start - Begin registration\n/help - Show this help\n/status - Check your booking status\n/getreceipt - View your stored receipt');
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
        
        // Update user with photo information
        const updatedUser = await User.findOneAndUpdate(
          { telegramId },
          { 
            photoId, 
            photoMimeType: 'image/jpeg'
          },
          { new: true } // Return the updated document
        );
        
        bot.sendMessage(chatId, 'Great! Your registration is complete');
        
        if (updatedUser) {
          await sharePhotoToGroup(bot, updatedUser);
        }
  
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

// Command for admins to manually share all unshared photos to the group
bot.onText(/\/shareall/, async (msg) => {
  const chatId = msg.chat.id;
  
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
      const shared = await sharePhotoToGroup(bot, user.toObject());
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

console.log('Bot is running...');