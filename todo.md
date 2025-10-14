# TODO — LNLink 节点活动任务系统

## 1. 任务范畴梳理
- **Taproot Asset 任务**
  - EnableTaprootAssetNode
  - ClaimToTaprootNode
  - TaprootAssetMainnetDeposit
  - CreateBTCChannel
  - CreateTaprootAssetChannel
  - TaprootAssetChannelWithdraw
  - CloseTaprootChannel
  - StopTaprootAssetNode
- **RGB 任务**
  - EnableRGBNode
  - ClaimBTCToRGBNode
  - ClaimRGBToken
  - RGBAssetMainnetDeposit
  - CreateRGBChannel
  - RGBChannelWithdraw
  - CloseRGBChannel
  - StopRGBNode
- **Zapper 任务**
  - CreateZapperEVMAccount

## 2. 数据模型设计
- **[ ]** 设计 `TaskDefinition` 表（任务静态配置）
  - 字段：`id`, `tag`, `displayName`, `category`, `description`, `isActive`, `createdAt`, `updatedAt`
  - `category ∈ {TAPROOT, RGB, ZAPPER}`
- **[ ]** 设计 `TaskCompletion` 表（用户完成记录）
  - 字段：`id`, `taskId`, `nostrAddress`, `completedAt`, `meta`, `createdAt`, `updatedAt`
  - 约束：`UNIQUE(taskId, nostrAddress)` 防止重复提交
- **[ ]** 根据 Prisma 规范撰写模型和关联
- **[ ]** 定义必要索引（按 `category`、`nostrAddress` 查询）

## 3. 数据初始化与迁移
- **[ ]** 编写 Prisma migration，新建两张表
- **[ ]** 准备 seed 脚本或脚本函数，批量插入上方任务清单
- **[ ]** 确认 `TaskDefinition` 中 tag 与前端/lnlink 约定一致

## 4. 服务与仓储层
- **[ ]** 新建 `taskService.js`
  - 方法：
    - `listTasksByUser(nostrAddress)`：返回分组结果（已完成/待完成，待完成由任务定义与完成记录比对得出，不存储 pending 状态）
    - `completeTask({ nostrAddress, tag, meta })`：幂等写入完成记录
  - 支撑函数：查询任务定义、构建默认元数据
- **[ ]** 日志记录与错误分类（任务不存在、已完成等）

## 5. API 设计
- **[ ]** `GET /api/tasks/:nostrAddress`
  - 响应结构：`{ category: TAPROOT, completed: [...], pending: [...] }`
- **[ ]** `POST /api/tasks/complete`
  - 请求：`{ nostrAddress, tag, meta? }`
  - 幂等返回：若已完成则提示“已完成”
- **[ ]** 在 `index.js` 注册路由并接入日志中间件
- **[ ]** 编写基础入参校验（缺少参数、非法 tag）

## 6. 业务规则 & 健壮性
- **[ ]** 确定任务是否支持重复激活/禁用（通过 `TaskDefinition.isActive` 控制）
- **[ ]** 保证完成记录写入在事务中进行（读取任务定义 + upsert，仅新增完成记录，不维护 pending 状态）
- **[ ]** 对 `meta` 字段约束（JSON 字段或 text）
- **[ ]** 若 tag 未定义，返回 404/400

## 7. 文档与后续
- **[ ]** 更新 `README.md`，新增活动任务 API 说明
- **[ ]** 记录部署/迁移步骤
- **[ ]** 列出后续安全策略（鉴权、速率限制）待办


