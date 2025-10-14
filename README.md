# LND Faucet

基于LND和RGB的水龙头应用，通过Nostr与lnlink节点通信。
https://gitlab.unift.xyz/lnfi/server/lnlink-faucet 
## 技术栈

- Node.js + Express
- SQLite + Prisma
- Nostr (nostr-tools)
- Pino (日志)

## 功能特性

- 支持BTC、Taproot、RGB资产领取
- 每个Nostr地址每天限领一次
- 通过Nostr与lnlink节点通信
- 完整的日志记录和数据库存储

## 快速开始

### 1. 安装依赖

```bash
yarn install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

```bash
yarn prisma:generate
yarn prisma:migrate
```

### 4. 启动开发环境

```bash
yarn start:dev
```

## API 接口

### 1. 领取资产

**POST** `/api/claim`

请求体：
```json
{
  "nostrAddress": "npub1xxx...",
  "assetType": "btc",
  "invoice": "bc1xxx..." or "lnbc...",
  "assetName": "Bitcoin"
}
```

- `assetType`: `btc`, `taproot`, `rgb`
- `invoice`: BTC使用address，Taproot和RGB使用invoice

响应：
```json
{
  "success": true,
  "message": "Claim successful",
  "txHash": "xxx",
  "amount": 0.0001,
  "assetType": "btc"
}
```

### 2. 查询领取历史

**GET** `/api/history/:nostrAddress?limit=10`

### 3. 检查是否可以领取

**GET** `/api/can-claim/:nostrAddress`

### 4. 管理员查询所有记录

**GET** `/api/admin/claims?page=1&pageSize=20`

### 5. 健康检查

**GET** `/health`

## Docker 部署

```bash
docker-compose up -d
```

## 项目结构

```
.
├── index.js              # Express API入口
├── faucetService.js      # 核心业务逻辑
├── nostrPool.js          # Nostr通信
├── logger.js             # 日志工具
├── prisma/
│   └── schema.prisma     # 数据库模型
├── logs/                 # 日志文件目录
├── faucet.db             # SQLite数据库
└── docker-compose.yml    # Docker配置
```

## 开发说明

- 日志文件按天分割，保留7天
- 数据库使用SQLite，生产环境可迁移到PostgreSQL
- Nostr消息通过`sendMessage`发送到lnlink节点
- 限流策略：每个Nostr地址每天只能领取一次

## License

MIT
