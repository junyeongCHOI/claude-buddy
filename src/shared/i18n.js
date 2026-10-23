// 화면에 보이는 글 번역 (한국어 · English · 日本語 · 简体中文).
// 메인 프로세스(트레이 메뉴)와 렌더러가 같이 쓴다. 각 프로세스가 자기 언어를 setLang 으로 정한다.
// 수집기는 언어와 상관없는 키(도구 이름 vk, 로그 tk)만 남기고, 글로 바꾸는 건 보여 줄 때 한다.

export const LANGS = ['ko', 'en', 'ja', 'zh'];
export const LANG_NAMES = { ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文' };

/** 설정값('system' 또는 언어 코드)과 시스템 선호 언어 목록 → 쓸 언어. 지원하지 않는 언어면 영어 */
export function resolveLang(pref, preferred = []) {
  if (LANGS.includes(pref)) return pref;
  for (const tag of preferred) {
    const l = String(tag).toLowerCase().split(/[-_]/)[0];
    if (LANGS.includes(l)) return l;
  }
  return 'en';
}

// style.css 의 --font 와 같아야 보드 글 폭을 정확히 잰다 (한자는 언어마다 글꼴 모양이 다르다)
export const FONT_FAMILY = {
  ko: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
  en: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
  ja: 'system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif',
  zh: 'system-ui, -apple-system, "PingFang SC", sans-serif',
};

// 키 → [한국어, English, 日本語, 简体中文]
const STR = {
  'tray.gather': ['친구들 모으기', 'Gather Friends', 'なかまを集める', '召集伙伴'],
  'tray.display': ['패널 디스플레이', 'Panel Display', 'パネルのディスプレイ', '面板显示器'],
  'tray.displayN': ['디스플레이 {n}', 'Display {n}', 'ディスプレイ {n}', '显示器 {n}'],
  'tray.panel': ['관계도 패널', 'Relationship Panel', '関係パネル', '关系面板'],
  'tray.pinnedOnly': ['고정한 세션만 보기', 'Pinned Sessions Only', 'ピン留めしたセッションのみ', '仅显示已固定的会话'],
  'tray.showSleeping': ['쉬는 세션도 보기', 'Show Idle Sessions', '休憩中のセッションも表示', '显示休息中的会话'],
  'tray.size': ['캐릭터 크기', 'Character Size', 'キャラクターの大きさ', '角色大小'],
  'tray.small': ['작게', 'Small', '小', '小'],
  'tray.medium': ['보통', 'Medium', '中', '中'],
  'tray.large': ['크게', 'Large', '大', '大'],
  'tray.language': ['언어', 'Language', '言語', '语言'],
  'tray.system': ['시스템 설정 따르기', 'System Default', 'システムに合わせる', '跟随系统'],
  'tray.login': ['로그인할 때 자동 실행', 'Open at Login', 'ログイン時に起動', '登录时启动'],
  'tray.resetBoards': ['화이트보드 위치 초기화', 'Reset Whiteboard Positions', 'ホワイトボードの位置をリセット', '重置白板位置'],
  'tray.reload': ['다시 불러오기', 'Reload', '再読み込み', '重新加载'],
  'tray.quit': ['종료', 'Quit', '終了', '退出'],
  helper: ['도우미', 'Helper', 'お手伝い', '助手'],
  'panel.gather': ['모으기', 'Gather', '集合', '召集'],
  'panel.gatherTip': ['잃어버린 친구들과 보드를 이 모니터 가운데로 모아요', 'Bring lost friends and their boards to the middle of this screen', '迷子のなかまとボードをこの画面の真ん中に集めます', '把走丢的伙伴和白板召集到这块屏幕中央'],
  'panel.empty': ['지금 돌아가는 Claude Code 세션이 없어요', 'No Claude Code sessions are running right now', '実行中の Claude Code セッションはありません', '当前没有运行中的 Claude Code 会话'],
  'panel.fold': ['접기', 'Collapse', 'たたむ', '收起'],
  'panel.unfold': ['펼치기', 'Expand', '広げる', '展开'],

  'card.kind': ['종류', 'Type', '種類', '类型'],
  'card.main': ['메인 에이전트', 'Main agent', 'メインエージェント', '主代理'],
  'card.sub': ['서브에이전트', 'Subagent', 'サブエージェント', '子代理'],
  'card.status': ['상태', 'Status', '状態', '状态'],
  'card.folder': ['폴더', 'Folder', 'フォルダ', '文件夹'],
  'card.parent': ['부모', 'Parent', '親', '父级'],
  'card.helpers': ['도우미', 'Helpers', 'お手伝い', '助手'],
  'card.helpersWorking': ['{n}마리 일하는 중', '{n} working', '{n}匹が作業中', '{n} 只在工作'],
  'card.request': ['요청', 'Request', 'リクエスト', '请求'],
  'card.task': ['임무', 'Task', '任務', '任务'],
  'card.tools': ['도구', 'Tools', 'ツール', '工具'],
  'card.toolUses': ['{n}번 사용', '{n} uses', '{n}回使用', '使用 {n} 次'],
  'card.errors': ['오류 {n}', '{n} errors', 'エラー {n}', '错误 {n}'],
  'card.recent': ['최근 활동', 'Recent activity', '最近の活動', '最近活动'],
  'card.close': ['닫기', 'Close', '閉じる', '关闭'],

  'ago.s': ['{n}초 전', '{n}s ago', '{n}秒前', '{n}秒前'],
  'ago.m': ['{n}분 전', '{n}m ago', '{n}分前', '{n}分钟前'],
  'ago.h': ['{n}시간 전', '{n}h ago', '{n}時間前', '{n}小时前'],

  'card.open': ['열기 ↗', 'Open ↗', '開く ↗', '打开 ↗'],
  'card.openApp': ['Claude 앱에서 이 세션 보기', 'Show this session in the Claude app', 'Claude アプリでこのセッションを表示', '在 Claude 应用中查看此会话'],
  'card.openTerm': ['이 세션이 돌고 있는 터미널 보기', 'Show the terminal running this session', 'このセッションが動いているターミナルを表示', '查看运行此会话的终端'],

  'panel.pinned': ['고정한 세션만 보기', 'Pinned sessions only', 'ピン留めしたセッションのみ', '仅显示已固定的会话'],
  'panel.menu': ['메뉴', 'Menu', 'メニュー', '菜单'],
  'panel.pinnedBtn': ['고정 세션', 'Pinned', 'ピン留め', '已固定'],
  'panel.emptyPinned': ['고정한 세션이 없어요. Claude 앱에서 세션을 고정하거나 위의 “고정 세션” 버튼을 꺼 보세요', 'No pinned sessions. Pin one in the Claude app, or turn off “Pinned” above', 'ピン留めしたセッションがありません。Claude アプリでピン留めするか、上の「ピン留め」をオフにしてください', '没有已固定的会话。请在 Claude 应用中固定一个，或关闭上方的“已固定”'],

  'bt.justDid': ['방금: {text}', 'Just did: {text}', 'さっき: {text}', '刚刚：{text}'],
  'bt.choosingNext': ['결과 보고 다음 단계 고르는 중', 'Checking results, picking the next step', '結果を見て次の手を考え中', '看看结果，挑选下一步'],

  'bubble.supervise': ['도우미 기다리는 중', 'Waiting for helpers', 'お手伝いを待っています', '正在等助手'],

  'board.fold': ['접기', 'Collapse', 'たたむ', '收起'],
  'board.unfold': ['펼치기', 'Expand', '広げる', '展开'],
  'board.resize': ['끌어서 크기 조절 · 더블클릭하면 자동 크기', 'Drag to resize · double-click to fit', 'ドラッグでサイズ変更・ダブルクリックで自動サイズ', '拖动调整大小 · 双击自动适应'],

  'bt.supervise': ['👀 도우미 기다리는 중', '👀 Waiting for helpers', '👀 お手伝いを待っています', '👀 正在等助手'],
  'bt.waiting': ['🙋 확인이 필요해요!', '🙋 Need your input!', '🙋 確認してほしいです！', '🙋 需要你确认！'],
  'bt.lookClaude': ['Claude 창을 봐 주세요', 'Please check the Claude window', 'Claude のウィンドウを見てください', '请看一下 Claude 窗口'],
  'bt.listening': ['📨 새 요청 받았어요', '📨 Got a new request', '📨 新しいリクエストです', '📨 收到新请求'],
  'bt.talking': ['💬 할 말', '💬 Saying', '💬 ひとこと', '💬 想说的话'],
  'bt.thinking': ['💭 생각 중…', '💭 Thinking…', '💭 考え中…', '💭 思考中…'],
  'bt.done': ['✅ 다 했어요!', '✅ All done!', '✅ できました！', '✅ 完成啦！'],
  'bt.idle': ['☕ 쉬는 중', '☕ Taking a break', '☕ 休憩中', '☕ 休息中'],
  'bt.lastPrompt': ['마지막 요청: {text}', 'Last request: {text}', '最後のリクエスト: {text}', '上次请求：{text}'],
  'bt.returning': ['📜 끝! 보고하러 가요', '📜 Done! Off to report', '📜 おわり！報告に行きます', '📜 完成！去汇报啦'],

  'st.work': ['작업 중', 'Working', '作業中', '工作中'],
  'st.supervise': ['도우미 대기', 'Waiting on helpers', 'お手伝い待ち', '等待助手'],
  'st.waiting': ['확인 필요', 'Needs input', '確認待ち', '需要确认'],
  'st.listening': ['요청 받음', 'New request', 'リクエスト受信', '收到请求'],
  'st.talking': ['말하는 중', 'Talking', '話し中', '说话中'],
  'st.thinking': ['생각 중', 'Thinking', '考え中', '思考中'],
  'st.idle': ['쉬는 중', 'Idle', '休憩中', '休息中'],
  'st.sleep': ['자는 중', 'Sleeping', 'おやすみ中', '睡觉中'],
  'st.returning': ['완료', 'Finished', '完了', '已完成'],
  'st.done': ['방금 끝남', 'Just finished', '終わったところ', '刚完成'],
  'st.calling': ['결정 필요', 'Decision needed', '決定待ち', '需要决定'],
  'st.calling-done': ['다 했어요', 'All done', 'できました', '完成啦'],

  'call.done': ['다 했어요!', 'All done!', 'できたよ！', '完成啦！'],
  'call.ask': ['결정이 필요해요!', 'I need a decision!', '決めてほしいな！', '需要你来决定！'],

  'log.error': ['앗, 오류가 났어요', 'Oops, an error', 'あっ、エラーです', '哎呀，出错了'],
  'log.interrupted': ['중단됨', 'Interrupted', '中断されました', '已中断'],
  'log.notify': ['백그라운드 작업 알림', 'Background task update', 'バックグラウンド作業のお知らせ', '后台任务通知'],

  'tool.Read': ['읽는 중', 'Reading', '読んでいます', '正在读'],
  'tool.NotebookRead': ['노트북 읽는 중', 'Reading notebook', 'ノートブックを読んでいます', '正在读笔记本'],
  'tool.Grep': ['검색 중', 'Searching', '検索中', '搜索中'],
  'tool.Glob': ['파일 찾는 중', 'Finding files', 'ファイルを探しています', '查找文件中'],
  'tool.LS': ['폴더 보는 중', 'Browsing folder', 'フォルダを見ています', '浏览文件夹'],
  'tool.Edit': ['고치는 중', 'Editing', '編集中', '修改中'],
  'tool.Write': ['쓰는 중', 'Writing', '書いています', '编写中'],
  'tool.NotebookEdit': ['노트북 고치는 중', 'Editing notebook', 'ノートブックを編集中', '修改笔记本中'],
  'tool.Bash': ['실행 중', 'Running', '実行中', '运行中'],
  'tool.BashOutput': ['출력 확인', 'Checking output', '出力を確認', '查看输出'],
  'tool.KillShell': ['작업 중지', 'Stopping task', '作業を停止', '停止任务'],
  'tool.Monitor': ['지켜보는 중', 'Watching', '見守り中', '盯着看'],
  'tool.WebSearch': ['웹 검색', 'Web search', 'ウェブ検索', '网页搜索'],
  'tool.WebFetch': ['페이지 읽는 중', 'Reading page', 'ページを読んでいます', '正在读网页'],
  'tool.Agent': ['도우미 부르는 중', 'Calling a helper', 'お手伝いを呼んでいます', '召唤助手中'],
  'tool.SendMessage': ['메시지 보내는 중', 'Sending message', 'メッセージ送信中', '发送消息中'],
  'tool.TodoWrite': ['할 일 정리', 'Sorting to-dos', 'やることを整理', '整理待办'],
  'tool.EnterPlanMode': ['계획 세우는 중', 'Making a plan', '計画を立てています', '制定计划中'],
  'tool.ExitPlanMode': ['계획 확인 부탁해요', 'Please review the plan', '計画を確認してね', '请确认计划'],
  'tool.AskUserQuestion': ['질문 있어요', 'I have a question', '質問があります', '我有个问题'],
  'tool.Skill': ['스킬 사용', 'Using a skill', 'スキルを使用', '使用技能'],
  'tool.ToolSearch': ['도구 꺼내는 중', 'Getting tools out', '道具を出しています', '翻找工具中'],
  'tool.Artifact': ['페이지 만드는 중', 'Making a page', 'ページを作っています', '制作页面中'],
  'tool.WrapUp': ['마무리 중', 'Wrapping up', '仕上げ中', '收尾中'],

  'animal.bear': ['곰', 'Bear', 'クマ', '熊'],
  'animal.cat': ['고양이', 'Cat', 'ネコ', '猫'],
  'animal.chick': ['병아리', 'Chick', 'ひよこ', '小鸡'],
  'animal.dog': ['시바', 'Shiba', '柴犬', '柴犬'],
  'animal.fox': ['여우', 'Fox', 'キツネ', '狐狸'],
  'animal.frog': ['개구리', 'Frog', 'カエル', '青蛙'],
  'animal.hamster': ['햄스터', 'Hamster', 'ハムスター', '仓鼠'],
  'animal.panda': ['판다', 'Panda', 'パンダ', '熊猫'],
  'animal.penguin': ['펭귄', 'Penguin', 'ペンギン', '企鹅'],
  'animal.rabbit': ['토끼', 'Rabbit', 'ウサギ', '兔子'],

  'fur.orig': ['기본색', 'Original', 'オリジナル', '原色'],
  'fur.black': ['검정', 'Black', '黒', '黑色'],
  'fur.darkbrown': ['진한 갈색', 'Dark brown', 'こげ茶', '深棕色'],
  'fur.brown': ['갈색', 'Brown', '茶色', '棕色'],
  'fur.lightbrown': ['연갈색', 'Light brown', '薄茶', '浅棕色'],
  'fur.redbrown': ['적갈색', 'Reddish brown', '赤茶', '红棕色'],
  'fur.orange': ['주황색', 'Orange', 'オレンジ', '橙色'],
  'fur.tan': ['황갈색', 'Tan', '黄褐色', '黄褐色'],
  'fur.beige': ['베이지색', 'Beige', 'ベージュ', '米色'],
  'fur.cream': ['크림색', 'Cream', 'クリーム', '奶油色'],
  'fur.white': ['흰색', 'White', '白', '白色'],
  'fur.gray': ['회색', 'Gray', 'グレー', '灰色'],
  'fur.darkgray': ['진회색', 'Dark gray', 'ダークグレー', '深灰色'],
  'fur.lime': ['연두색', 'Lime', '黄緑', '黄绿色'],
  'fur.teal': ['청록색', 'Teal', '青緑', '青绿色'],
  'fur.darkgreen': ['진초록', 'Dark green', '深緑', '深绿色'],
  'fur.yellow': ['노란색', 'Yellow', '黄色', '黄色'],
  'fur.blue': ['파란색', 'Blue', '青', '蓝色'],
};

let lang = 'en';

export const getLang = () => lang;

export function setLang(l) {
  lang = LANGS.includes(l) ? l : 'en';
}

/** 키 → 지금 언어의 글. {이름} 자리에 vars 값을 넣는다. 없는 키는 영어, 그래도 없으면 키 그대로 */
export function t(key, vars) {
  const s = STR[key]?.[LANGS.indexOf(lang)] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s;
}

/** 도구 활동·로그의 동사. 아는 도구는 vk 로 번역하고, MCP·모르는 도구는 수집기가 만든 verb 그대로 */
export function toolVerb(p) {
  return p?.vk ? t(`tool.${p.vk}`) : p?.verb || p?.name || '';
}

/** 최근 활동 한 줄 */
export function logText(item) {
  if (item.tk) return t(item.tk);
  if (item.vk || item.verb) {
    const v = toolVerb(item);
    return item.arg ? `${v} · ${item.arg}` : v;
  }
  return item.text || '';
}

/** 에이전트 이름표: 메인은 세션 이름, 서브는 '종류 · 임무' */
export function agentLabel(a) {
  if (a.kind === 'main') return a.name;
  return [a.agentType || t('helper'), a.description || a.name].filter(Boolean).join(' · ');
}
