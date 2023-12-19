// @see https://docs.aircode.io/guide/functions/
const aircode = require('aircode');
const lark = require('@larksuiteoapi/node-sdk');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 获取 tenant_access_token
const getTenantToken = async () => {
  const url =
    'https://open.feishu.cn/open-apis/v3/auth/tenant_access_token/internal/';
  const res = await axios.post(url, {
    app_id: FEISHU_APP_ID,
    app_secret: FEISHU_APP_SECRET,
  });
  return res.data.tenant_access_token;
};

const chatGemini = async (msg) => {
  console.log('msg', msg);
  // For text-only input, use the gemini-pro model
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const chat = model.startChat({
    history: [
      {
        role: 'user',
        parts: '你好, Gemini. 请使用我使用的语言来回答问题',
      },
      {
        role: 'model',
        parts: '好的，很高兴认识你',
      },
    ],
    generationConfig: {
      maxOutputTokens: 100,
    },
  });

  const result = await chat.sendMessage(msg);
  const response = await result.response;
  const text = response.text();
  console.log('resp:', text, text.length);
  return text;
};

module.exports = async function (params, context) {
  console.log('Received params:', params);

  const { challenge, event } = params;
  const { message } = event;
  const { message_id, content } = message;
  const { text } = JSON.parse(content);

  console.log('content.text', content);

  if (challenge) {
    return {
      challenge,
    };
  }

  const MessageTable = aircode.db.table('messages');

  // Check if message already processed
  const existing = await MessageTable.where({
    message_id,
  }).find();

  // If record found, skip processing
  if (existing.length > 0) {
    console.log('Message already processed, skipping');
    return;
  }

  // node-sdk使用说明：https://github.com/larksuite/node-sdk/blob/main/README.zh.md

  // 开发者复制该Demo后，需要修改Demo里面的"app id", "app secret"为自己应用的appId, appSecret
  const client = new lark.Client({
    appId: FEISHU_APP_ID,
    appSecret: FEISHU_APP_SECRET,
    // disableTokenCache为true时，SDK不会主动拉取并缓存token，这时需要在发起请求时，调用lark.withTenantToken("token")手动传递
    // disableTokenCache为false时，SDK会自动管理租户token的获取与刷新，无需使用lark.withTenantToken("token")手动传递token
    disableTokenCache: true,
  });

  const geminiResponse = await chatGemini(text);
  const tenantToken = await getTenantToken();

  await MessageTable.save({
    message_id,
  });

  return client.im.message.reply(
    {
      path: {
        message_id,
      },
      data: {
        content: JSON.stringify({ text: geminiResponse }),
        msg_type: 'text',
      },
    },
    lark.withTenantToken(tenantToken)
  );
};
