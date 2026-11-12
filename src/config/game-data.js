/** Static content definitions: keep world-specific facts out of the engine. */
export const WORLDS = {
  "lingzai": {
    "name": "灵灾",
    "resourceName": "灵石",
    "stages": [
      "练气",
      "筑基",
      "金丹",
      "元婴"
    ],
    "finalCost": 10,
    "boss": false
  },
  "zombie": {
    "name": "尸潮",
    "resourceName": "废土零件",
    "stages": [
      "幸存者",
      "猎杀者",
      "清剿者",
      "末日猎手"
    ],
    "finalCost": 12,
    "boss": true
  },
  "beast": {
    "name": "兽潮",
    "resourceName": "进化结晶",
    "stages": [
      "猎人",
      "强化者",
      "超凡猎人",
      "进化领主"
    ],
    "finalCost": 14,
    "boss": true
  }
};

/** Static content definitions: keep world-specific facts out of the engine. */
export const POWERS = {
  "lingzai": [
    {
      "id": "thunder",
      "name": "驭雷符",
      "slot": "attack",
      "kind": "clear"
    },
    {
      "id": "sword",
      "name": "飞剑回旋",
      "slot": "attack",
      "kind": "loot"
    },
    {
      "id": "rune",
      "name": "聚灵阵纹",
      "slot": "support",
      "kind": "defense"
    }
  ],
  "zombie": [
    {
      "id": "blades",
      "name": "碎片飞刃",
      "slot": "attack",
      "kind": "clear"
    },
    {
      "id": "arc",
      "name": "电弧投射器",
      "slot": "attack",
      "kind": "loot"
    },
    {
      "id": "armor",
      "name": "简易护甲",
      "slot": "support",
      "kind": "defense"
    }
  ],
  "beast": [
    {
      "id": "claws",
      "name": "裂爪连击",
      "slot": "attack",
      "kind": "clear"
    },
    {
      "id": "roar",
      "name": "震地咆哮",
      "slot": "attack",
      "kind": "loot"
    },
    {
      "id": "instinct",
      "name": "追猎直觉",
      "slot": "support",
      "kind": "defense"
    }
  ]
};

/** Static content definitions: keep world-specific facts out of the engine. */
export const COMBOS = {
  "lingzai": [
    "thunder",
    "rune",
    "雷阵连锁"
  ],
  "zombie": [
    "blades",
    "armor",
    "钢雨防线"
  ],
  "beast": [
    "claws",
    "instinct",
    "连环猎杀"
  ]
};

/** Static content definitions: keep world-specific facts out of the engine. */
export const THRESHOLDS = [
  0,
  14,
  42,
  78
];

/** Static content definitions: keep world-specific facts out of the engine. */
export const LABELS = {
  "growth": "成长优先",
  "clear": "清剿优先",
  "rescue": "拯救优先"
};
