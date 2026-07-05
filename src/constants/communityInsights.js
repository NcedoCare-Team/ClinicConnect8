// Simulated community health insights — shared between Home preview and Insights tab.

export const COMMUNITY_INSIGHTS = [
  {
    id: 'flu',
    icon: 'leaf-outline',
    category: 'Seasonal Alert',
    title: 'Flu activity rising',
    text: 'Flu cases have increased in your community this week. Consider vaccination if you have not had one this season.',
    date: 'Updated today',
  },
  {
    id: 'hydration',
    icon: 'water-outline',
    category: 'Wellness Tip',
    title: 'Stay hydrated',
    text: 'Warmer days are expected this week. Drink water regularly, especially if you are on medication.',
    date: 'Updated today',
  },
  {
    id: 'movement',
    icon: 'fitness-outline',
    category: 'Recovery',
    title: 'Light movement helps',
    text: 'Regular gentle movement supports recovery and overall wellbeing. Even a short walk can make a difference.',
    date: 'Updated yesterday',
  },
  {
    id: 'air',
    icon: 'cloud-outline',
    category: 'Air Quality',
    title: 'Moderate air quality',
    text: 'Air quality in your area is moderate today. Sensitive groups may want to limit prolonged outdoor activity.',
    date: 'Updated 2 days ago',
  },
  {
    id: 'sleep',
    icon: 'moon-outline',
    category: 'Rest & Recovery',
    title: 'Prioritise sleep',
    text: 'Quality sleep strengthens immunity. Aim for 7–8 hours, especially when recovering from illness.',
    date: 'Updated 3 days ago',
  },
  {
    id: 'nutrition',
    icon: 'nutrition-outline',
    category: 'Nutrition',
    title: 'Balanced meals matter',
    text: 'Include fruits and vegetables daily. Good nutrition supports faster recovery and sustained energy.',
    date: 'Updated 4 days ago',
  },
];

/** First three insights shown on the My Care home preview. */
export const HOME_INSIGHT_PREVIEW = COMMUNITY_INSIGHTS.slice(0, 3);
