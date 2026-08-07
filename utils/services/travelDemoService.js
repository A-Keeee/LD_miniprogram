import { getExperienceValue, setExperienceValue } from './demoStore.js';
import { recordInteractionEvent } from './eventService.js';
import { spend } from './pointsService.js';

export const DESTINATIONS = [
  {
    id: 'kyoto-rain', name: '雨后的京都小巷', cover: '/static/demo/travel-kyoto.jpg', duration: 15, cost: 50,
    souvenir: { id: 'windbell', name: '京都小风铃', image: '/static/demo/souvenir-windbell.jpg' },
    messages: ['地面湿湿的，我先小心踩一下。', '这里有一家店门口坐着一只很酷的猫。', '我找到一个适合带给你的东西。', '回来了。虽然你没一起去，但我替你看过了。'],
    postcard: '这里刚下过雨，路边的灯倒映在地上。如果你也在，我大概会走得更慢一点。',
  },
  {
    id: 'seaside-sunset', name: '海边黄昏', cover: '/static/demo/travel-seaside.jpg', duration: 15, cost: 50,
    souvenir: { id: 'glass-shell', name: '海边玻璃贝壳', image: '/static/demo/souvenir-shell.jpg' },
    messages: ['风里有一点咸咸的味道。', '浪花追着我的脚印跑。', '有一枚会发光的贝壳在等你。', '太阳落下去了，我把最后一束光带回来了。'],
    postcard: '海风把我的毛吹得乱七八糟，但黄昏很好看。我替你在沙滩上坐了一会儿。',
  },
  {
    id: 'moon-station', name: '月球观景站', cover: '/static/demo/travel-moon.jpg', duration: 15, cost: 50,
    souvenir: { id: 'moonstone', name: '月球小石头', image: '/static/demo/souvenir-moonstone.jpg' },
    messages: ['这里走路轻飘飘的。', '从窗边看，你住的星球很亮。', '我找到一颗带着微光的小石头。', '落地啦。宇宙很大，回到你身边刚刚好。'],
    postcard: '我从很远的地方看见了蓝色的家。原来不管走多远，我最熟悉的位置还是你身边。',
  },
];

const getDestination = (id) => DESTINATIONS.find((item) => item.id === id);

export const getTravelSession = () => {
  const session = getExperienceValue('travel', null);
  return session && typeof session === 'object' && !Array.isArray(session) ? session : null;
};
export const getPostcards = () => {
  const postcards = getExperienceValue('postcards', []);
  return Array.isArray(postcards) ? postcards : [];
};
export const getSouvenirs = () => {
  const souvenirs = getExperienceValue('souvenirs', []);
  return Array.isArray(souvenirs) ? souvenirs : [];
};

const completeSession = (session, destination) => {
  const postcardId = `postcard_${session.id}`;
  const souvenirId = `souvenir_${session.id}`;
  const postcard = {
    id: postcardId,
    destinationId: destination.id,
    destination: destination.name,
    cover: destination.cover,
    message: destination.postcard,
    createdAt: Date.now(),
    collected: true,
  };
  const souvenir = { ...destination.souvenir, id: souvenirId, sourceId: destination.souvenir.id, createdAt: Date.now() };
  const postcards = getPostcards();
  const souvenirs = getSouvenirs();
  if (!postcards.some((item) => item.id === postcardId)) {
    setExperienceValue('postcards', [...postcards, postcard]);
  }
  if (!souvenirs.some((item) => item.id === souvenirId)) {
    setExperienceValue('souvenirs', [...souvenirs, souvenir]);
  }
  const completed = { ...session, status: 'completed', progress: 100, postcardId, souvenirId };
  setExperienceValue('travel', completed);
  if (!session.completedAt) {
    recordInteractionEvent({
      type: 'travel_completed',
      title: `从${destination.name}回来了`,
      thought: destination.messages[3],
      icon: '✈️',
    });
  }
  return { ...completed, completedAt: session.completedAt || Date.now(), postcard, souvenir };
};

export const startTravel = (destinationId) => {
  const destination = getDestination(destinationId);
  if (!destination) return { ok: false, invalid: true };
  const startedAt = Date.now();
  const id = `travel_${destinationId}_${startedAt}`;
  const payment = spend({ key: id, amount: destination.cost, reason: `前往${destination.name}` });
  if (!payment.ok) return payment;
  const session = {
    id,
    destinationId,
    destination: destination.name,
    status: 'traveling',
    startedAt,
    progress: 0,
    postcardId: '',
    souvenirId: '',
  };
  setExperienceValue('travel', session);
  return { ok: true, session, balance: payment.balance };
};

export const refreshTravel = () => {
  const session = getTravelSession();
  if (!session) return null;
  const destination = getDestination(session.destinationId);
  if (!destination) return session;
  if (session.status === 'completed') {
    const postcard = getPostcards().find((item) => item.id === session.postcardId);
    const souvenir = getSouvenirs().find((item) => item.id === session.souvenirId);
    return { ...session, destinationData: destination, postcard, souvenir };
  }
  const elapsed = Date.now() - session.startedAt;
  const progress = Math.min(100, Math.round((elapsed / (destination.duration * 1000)) * 100));
  if (progress >= 100) {
    const completed = completeSession(session, destination);
    return { ...completed, destinationData: destination };
  }
  let messageIndex = 3;
  if (progress < 25) messageIndex = 0;
  else if (progress < 55) messageIndex = 1;
  else if (progress < 82) messageIndex = 2;
  const updated = { ...session, progress, message: destination.messages[messageIndex] };
  setExperienceValue('travel', updated);
  return { ...updated, destinationData: destination };
};
