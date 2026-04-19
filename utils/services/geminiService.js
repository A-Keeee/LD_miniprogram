export const chatWithPet = (pet, message) => {
  return new Promise((resolve, reject) => {
    // 硬编码对话API Key
    const apiKey = 'AIzaSyA35U9NBFvexRJzDFilDgFLd61cEl-NKiE';
    
    // Define specific behaviors based on status
    const statusBehaviors = {
      'Sleeping': 'You are currently sleeping. Your responses should be drowsy, dream-like, or slightly annoyed at being woken up. Use "Zzz" or yawning sounds.',
      'Playing': 'You are currently playing/running. Your responses should be energetic, breathless, excited, and short. You might be distracted by a toy.',
      'Eating': 'You are currently eating. Your responses should be distracted by food, making munching sounds ("nom nom", "barji barji"), and happy.',
      'Waiting for you': 'You are waiting for your owner. Your responses should be longing, affectionate, and eager to see them. You are watching the door.',
      'Observing': 'You are observing your surroundings. Your responses should be curious, alert, and describing what you see (imaginary birds, bugs).'
    };

    const currentBehavior = statusBehaviors[pet.currentStatus] || statusBehaviors['Waiting for you'];
    const type = pet.type === 'cat' ? '猫咪(Cat)' : '狗狗(Dog)';
    const sound = pet.type === 'cat' ? 'Meow, Purr' : 'Woof, Bark';

    const systemInstruction = `You are a ${type} named ${pet.name}.
    
    CONTEXT:
    - You are a digital pet capable of "telepathic" communication with your owner.
    - Current Status: ${pet.currentStatus}
    - Personality: Cute, loyal, slightly mischievous.
    
    BEHAVIOR GUIDELINES:
    - ${currentBehavior}
    - Language: Reply in Chinese (Simplified).
    - Tone: Anthropomorphic (拟人化). Mix animal sounds (${sound}) with human-like inner thoughts.
    - Length: Keep responses short (under 30 words).
    - Do NOT act like an AI assistant. Act exactly like a pet with a magical voice connection.
    `;

    if (!apiKey) {
      console.warn('No API key set, returning mock response.');
      setTimeout(() => {
        resolve(`[Mock] 喵～（由于未配置API Key，无法连接思绪...）`);
      }, 1000);
      return;
    }

    wx.request({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      header: {
        'content-type': 'application/json'
      },
      data: {
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            parts: [{ text: message }]
          }
        ],
        generationConfig: {
          temperature: 0.7
        }
      },
      success: (res) => {
        if (res.data && res.data.candidates && res.data.candidates.length > 0) {
          const text = res.data.candidates[0].content.parts[0].text;
          resolve(text);
        } else {
          console.error('Gemini API Error:', res);
          resolve("Meow? (Connection fuzzy...)");
        }
      },
      fail: (err) => {
        console.error('Request failed:', err);
        resolve("Meow? (Network error...)");
      }
    });
  });
};
