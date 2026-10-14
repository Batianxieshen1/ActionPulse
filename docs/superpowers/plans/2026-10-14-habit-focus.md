# 日常习惯直接进入聚焦模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户可直接把今天未完成的日常习惯带入现有聚焦台面，完成时只打卡该习惯，不创建待办或改变任务统计。

**Architecture:** 习惯保留独立数据模型，通过新增幂等的领域完成函数与 reducer action记录当天完成。聚焦台面接收 `task` / `habit` 两种临时目标；任务流程保持现有行为，习惯流程复用计时器但有独立呈现与完成回调。HabitBar 提供收起状态的下一习惯快捷入口和展开列表中的指定入口。状态不持久化额外聚焦信息，也不修改同步/服务端。

**Tech Stack:** React 19、TypeScript、Vitest、Vite、现有 Tailwind/CSS token。

---

## 文件影响范围

- 修改 `src/domain/habits.ts`：增加幂等的“完成今天”领域操作，并提供按现有顺序选出首个未完成习惯的纯函数。
- 修改 `src/store/taskStore.ts`：增加 `habit/complete` action；保持现有 `habit/toggle` 可撤销语义。
- 修改 `src/hooks/useActionPulse.ts`：暴露专用习惯完成回调，完成时沿用习惯正反馈但不更新任务 Combo/统计。
- 修改 `src/ui/HabitBar.tsx`：增加收起状态的首个未完成习惯快捷入口、展开状态逐项聚焦入口及清楚的按钮标签。
- 修改 `src/App.tsx`：用临时的判别联合聚焦意图区分普通任务、盲盒指定任务和指定习惯，接通新入口与完成回调。
- 修改 `src/ui/FocusStage.tsx`：支持两种聚焦目标；仅习惯分支展示习惯身份和幂等完成操作，任务分支继续原有排序/跳过/微步骤。
- 修改 `tests/habits.test.ts`、`tests/store.test.ts`：领域选择和 reducer 完成语义测试。
- 修改 `README.md`、`README.zh-CN.md`：交付后同步说明习惯可直接聚焦；测试数量只在确认后更新。

## 实施任务

### Task 1: 定义“完成今天”的幂等习惯领域操作

**Files:**
- Modify: `src/domain/habits.ts`
- Test: `tests/habits.test.ts`

- [ ] **Step 1: 先写完成操作的失败测试**

在 `tests/habits.test.ts` 的 toggle 用例之后新增测试。由现有 `habit()` fixture 创建空日期习惯；验证第一次完成写入今天、更新戳严格递增；再对已完成习惯调用时日期列表与更新时间保持不变；历史日期不被移除。

目标 API：`completeHabitDate(habit, today, now): DailyHabit`。测试直接检查结果，不要通过 toggle 模拟完成。

- [ ] **Step 2: 运行目标测试并确认因导出缺失失败**

Run: `npx vitest run tests/habits.test.ts`
Expected: FAIL，提示 `completeHabitDate` 未导出或未定义。

- [ ] **Step 3: 实现幂等领域函数**

在 `src/domain/habits.ts` 引入当前日期判断所需的现有 `isDoneToday`，实现：已完成时返回原习惯；未完成时复制并排序 `completedDates`，加入当天日期，并将 `updatedAt` 设为 `Math.max(now, habit.updatedAt + 1)`。不要改变 `toggleHabitDate`。

```ts
export function completeHabitDate(habit: DailyHabit, today: string, now: number): DailyHabit {
  if (isDoneToday(habit, today)) return habit;
  return {
    ...habit,
    completedDates: [...habit.completedDates, today].sort(),
    updatedAt: Math.max(now, habit.updatedAt + 1),
  };
}
```

- [ ] **Step 4: 重跑领域测试**

Run: `npx vitest run tests/habits.test.ts`
Expected: 全部通过，既有 toggle 取消测试继续通过。

- [ ] **Step 5: 提交领域操作**

```bash
git add tests/habits.test.ts src/domain/habits.ts
git commit -m "feat: 添加幂等的习惯完成操作"
```

### Task 2: 为 HabitBar 提供稳定的快捷候选

**Files:**
- Modify: `src/domain/habits.ts`
- Test: `tests/habits.test.ts`

- [ ] **Step 1: 写首个未完成习惯选择的测试**

对 `nextUncompletedHabit(habits, today)` 写用例：保留传入顺序；跳过已完成项和已归档项；无候选项时返回 `null`；不修改输入数组或习惯对象。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/habits.test.ts`
Expected: FAIL，提示目标选择函数缺失。

- [ ] **Step 3: 实现纯选择函数**

增加 `nextUncompletedHabit`，通过数组顺序查找第一个 `!archived && !isDoneToday(habit, today)` 项；找不到则返回 `null`。不要排序或复制/创建习惯。

```ts
export function nextUncompletedHabit(
  habits: readonly DailyHabit[],
  today: string,
): DailyHabit | null {
  return habits.find((habit) => !habit.archived && !isDoneToday(habit, today)) ?? null;
}
```

- [ ] **Step 4: 重跑领域测试**

Run: `npx vitest run tests/habits.test.ts`
Expected: 全部通过。

- [ ] **Step 5: 提交候选选择器**

```bash
git add tests/habits.test.ts src/domain/habits.ts
git commit -m "feat: 选择下一个待完成的日常习惯"
```

### Task 3: 增加 reducer 的幂等习惯完成 action

**Files:**
- Modify: `src/store/taskStore.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: 写 reducer 行为测试**

在 `tests/store.test.ts` 习惯 action 区新增用例，dispatch `{ type: "habit/complete", id, now }` 并断言今天完成。重复 dispatch 后只包含一个今天日期。分别保存并比较 `stats`、`daily`、`tasks`，证明习惯完成没有更改任务完成统计或列表。

另加边界用例：未知习惯 ID 不改变 state；无效日期时间不写完成记录。

- [ ] **Step 2: 运行目标测试确认失败**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL，action 类型或 reducer case 尚不存在。

- [ ] **Step 3: 接通 action 与领域函数**

在 `Action` 联合加入 `{ type: "habit/complete"; id: string; now: number }`。reducer 中解析 `dateKeyOf(action.now)`；日期无效或目标不存在时返回原 state；调用 `completeHabitDate` 更新目标习惯。

若 `completeHabitDate` 返回原习惯（已经完成），也返回原 state，避免空操作触发重渲染和同步推送。禁止在该分支触碰 `stats`、`daily` 或 `tasks`。

- [ ] **Step 4: 重跑 reducer 测试**

Run: `npx vitest run tests/store.test.ts`
Expected: 全部通过，任务完成/撤销、习惯 toggle 和其他 reducer 行为无回归。

- [ ] **Step 5: 提交 reducer 行为**

```bash
git add tests/store.test.ts src/store/taskStore.ts
git commit -m "feat: 添加习惯幂等完成 action"
```

### Task 4: 建立聚焦目标的判别联合并保留任务模式

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/FocusStage.tsx`
- Verify: `src/ui/TaskList.tsx`、`src/ui/QuadrantBoard.tsx`、`src/ui/Header.tsx`

- [ ] **Step 1: 定义临时聚焦意图类型**

在 `src/App.tsx` 为界面运行状态定义判别联合：

```ts
type FocusIntent =
  | { kind: "task"; pinnedTaskId: string | null }
  | { kind: "habit"; habitId: string };
```

用 `FocusIntent | null` 替换相互独立且含义重叠的 `focusOpen` 与 `pinnedFocusId`，确保点击普通聚焦、盲盒和习惯入口时只产生一种 intent。保持 `enterFocus` 对当前任务的空态提示；盲盒仍固定抽中的任务。Escape 与退出回调都将 intent 清空。

- [ ] **Step 2: 扩展 FocusStage props 为判别联合**

在 `src/ui/FocusStage.tsx` 定义 `task` 与 `habit` 两种 props。共享字段包括日期、番茄钟时长、计时结束、专注分钟记录和退出回调。`task` 分支携带任务列表、固定任务 ID、任务回调；`habit` 分支携带 `DailyHabit`、是否今天完成、完成回调。

普通任务 props 的签名和行为保持等价；组件内继续无条件调用 Hook，仅在渲染部分按 `kind` 分支，避免违反 Hook 顺序规则。

- [ ] **Step 3: 为任务与习惯各做独立的目标呈现**

任务分支保留当前 `current` 选择、跳过、微步骤、任务勾选和标签原样。习惯分支只渲染 emoji、标题、「日常习惯」标签、计时器和「完成今日习惯」主按钮；不渲染紧迫度、due、微步骤和跳过。

习惯已完成时禁用完成按钮，显示完成状态和返回清单按钮；未完成时点击完成回调并显示本地成功状态。进入时不调用 `timer.start()`；timer finish 回调不调用习惯完成回调。增加 `habitCompleted` 本地 UI 状态：点击完成时先调用 `onCompleteHabit()`，然后暂停计时器并进入完成状态；初始已完成的习惯直接进入完成状态。完成状态不允许继续开始或恢复计时。完成时清理尚未完成的 kickstart refill 提示，但不要调用 `timer.reset()` 清零 elapsed；已跑整分钟仍需按既有退出流程结算。

- [ ] **Step 4: 运行类型检查与构建**

Run: `npm run typecheck`
Expected: PASS；所有 `FocusStage` call sites 通过判别联合检查。

Run: `npm run build`
Expected: PASS；现有普通任务调用点均已传入 `kind: "task"`，无构建错误。

- [ ] **Step 5: 提交聚焦目标分支**

```bash
git add src/App.tsx src/ui/FocusStage.tsx
git commit -m "feat: 让聚焦台面支持日常习惯"
```

### Task 5: 暴露专用习惯完成回调

**Files:**
- Modify: `src/hooks/useActionPulse.ts`
- Modify: `src/App.tsx`
- Test: `tests/store.test.ts`（必要时补充 hook 可测试的纯函数行为到 `tests/habits.test.ts`）

- [ ] **Step 1: 锁定任务与习惯反馈的边界测试**

确保 Task 3 的 reducer 测试已断言习惯完成不改变 `stats` 与 `daily`。若抽取了习惯完成反馈决策函数，再为该纯函数补测试，证明习惯反馈不计算或修改 `nextCombo`。

- [ ] **Step 2: 为 hook 增加专用完成回调**

在 `ActionPulseApi` 增加 `completeHabit(habit: DailyHabit): void`，实现为 dispatch `{ type: "habit/complete", id: habit.id, now: Date.now() }`。沿用现有习惯完成时的音效、触觉和轻量正反馈，但不要调用 `nextCombo`、更新任务 Combo 或使用“今日任务清空”统计逻辑。已完成的习惯不应重复触发反馈。

- [ ] **Step 3: 暴露给 App 并运行类型检查**

在 `useActionPulse` 返回对象加入 `completeHabit`；在 `src/App.tsx` 解构并传给习惯聚焦分支的完成 handler。

Run: `npm run typecheck`
Expected: PASS。

- [ ] **Step 4: 提交专用回调**

```bash
git add src/hooks/useActionPulse.ts src/App.tsx tests/store.test.ts tests/habits.test.ts
git commit -m "feat: 接入日常习惯聚焦完成反馈"
```

### Task 6: 增加收起摘要与逐项习惯聚焦入口

**Files:**
- Modify: `src/ui/HabitBar.tsx`
- Modify: `src/App.tsx`
- Verify: `src/index.css`

- [ ] **Step 1: 定义 HabitBar 的聚焦入口回调**

在 `HabitBar` props 增加 `onFocusHabit: (habit: DailyHabit) => void`。App 传入 `habitId` 对应的习惯 intent handler。焦点入口不能调用 `onToggle`、创建待办或改习惯完成状态。

- [ ] **Step 2: 给收起状态增加下一项快捷操作**

使用 `nextUncompletedHabit(habits, today)`。存在候选时，在「日常 x/y」摘要行增加显示习惯 emoji/名称的可见按钮；点击该按钮将这一个习惯送入聚焦。没有候选项时不显示快捷按钮。窄屏允许布局换行，不能隐藏按钮标签或挤压到无法点击。

- [ ] **Step 3: 给展开列表增加指定习惯操作**

对每个未完成的习惯增加单独的聚焦按钮，使用现有 `Target`/`Play` 图标库或文字按钮，并设置 `aria-label="聚焦日常：${habit.title}"` 与可见 focus ring。已完成项显示「今天已完成」状态，不提供开始未完成习惯的按钮。原打卡与归档按钮保持独立。

- [ ] **Step 4: 静态检查并做交互验收**

Run: `npm run typecheck`
Expected: PASS。

手动验收桌面和窄屏：收起摘要点下一项、展开后启动指定项、点击打卡、点击归档；确认四种动作目标不同，点击聚焦不打卡。键盘 Tab 能聚焦每个新按钮，Enter/Space 能激活，按钮无需 hover 才出现。

- [ ] **Step 5: 提交 HabitBar 入口**

```bash
git add src/ui/HabitBar.tsx src/App.tsx
git commit -m "feat: 从日常栏直接开始聚焦"
```

### Task 7: 更新功能说明并做全量验收

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Verify: `src/App.tsx`、`src/ui/FocusStage.tsx`、`src/ui/HabitBar.tsx`

- [ ] **Step 1: 同步中英文的每日习惯说明**

在两份 README 的每日习惯章节都说明：日常栏收起状态可聚焦下一项、展开状态可指定习惯、完成按钮只记录当天习惯；习惯不复制到待办。只写已实现行为。

- [ ] **Step 2: 运行全量单测**

Run: `npm test`
Expected: 所有测试文件与测试用例通过，包括领域、reducer、同步与服务端冒烟测试。

- [ ] **Step 3: 运行完整生产构建**

Run: `npm run build`
Expected: TypeScript 检查、公共脚本语法守卫与 Vite production build 全部通过。

- [ ] **Step 4: 运行浏览器/手工回归清单**

验证以下场景：

1. 有两个以上未完成习惯时，收起栏显示并启动顺序第一项。
2. 第一项已完成后，快捷入口转到下一项；全完成/无习惯时入口消失。
3. 展开状态启动指定习惯；画面名称、emoji 与习惯标记正确，任务特有控件不显示。
4. 进入习惯聚焦不自动计时；主动开始、暂停、退出仍使用现有计时规则。
5. 计时结束不打卡；退出不打卡；显式完成只记录今天习惯且不改变任务统计。
6. 快速重复点击完成保持已完成；已完成后按钮提供明确状态和退出路径。
7. 普通任务聚焦、跳过、完成、盲盒指定任务和 Escape 关闭均维持原行为。
8. 桌面、窄屏、键盘焦点顺序及屏幕阅读器按钮名称可理解。

- [ ] **Step 5: 提交文档与已验证功能**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: 说明日常习惯聚焦功能"
```

## 计划自检

- 设计的 12 个章节均有对应任务：两种入口、habit/task 聚焦分支、幂等完成、计时器语义、任务统计隔离、边界场景、可访问性、窄屏布局、回归验证、中英文说明。
- 明确不实现拖放、同步或持久化 schema 变更。
- 领域 API 与 action 命名在各任务中一致：`completeHabitDate`、`nextUncompletedHabit`、`habit/complete`、`FocusIntent`、`onFocusHabit`、`completeHabit`。
- 每项行为先添加或确认测试，再实现；每个任务有明确验证命令和提交边界。
