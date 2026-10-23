// winwatch: 화면에 보이는 창/위젯의 위치를 주기적으로 JSON 한 줄로 출력한다.
// 사용법: winwatch <제외할 pid> [간격(ms)]
// 출력은 이전과 달라졌을 때만 내보낸다. 화면 기록 권한 없이도 위치·소유 앱 이름은 읽힌다.
// 마우스 버튼이 눌리는 순간에는 {"t":"click","x":..,"y":..} 를 내보낸다 (버튼 상태만 읽어서 권한 불필요).
import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

let args = CommandLine.arguments
let ownPid = args.count > 1 ? Int(args[1]) ?? -1 : -1
let intervalMs = args.count > 2 ? Double(args[2]) ?? 150 : 150
let parentPid = getppid()

let widgetOwners: Set<String> = ["Notification Center", "알림 센터", "NotificationCenter"]
let ignoredOwners: Set<String> = [
  "Window Server", "Dock", "Control Center", "제어 센터", "Spotlight", "SystemUIServer",
  "Screenshot", "스크린샷", "WindowManager", "Wallpaper", "배경화면",
]

var last = ""
var wasDown = false
var tick = 0
let pollMs = 30.0
// 창이 움직이는 동안(마지막 변화 후 2초)은 촘촘히, 가만히 있으면 400ms 마다만 본다 (CPU 절약)
let fastEvery = max(1, Int(intervalMs / pollMs))
let slowEvery = max(fastEvery, Int(400 / pollMs))
var lastChange = 0

while true {
  // 부모(Electron)가 죽으면 같이 종료
  if getppid() != parentPid { exit(0) }

  let down = CGEventSource.buttonState(.combinedSessionState, button: .left)
    || CGEventSource.buttonState(.combinedSessionState, button: .right)
  if down && !wasDown, let loc = CGEvent(source: nil)?.location {
    print("{\"t\":\"click\",\"x\":\(Int(loc.x)),\"y\":\(Int(loc.y))}")
  }
  wasDown = down
  tick += 1
  let every = Double(tick - lastChange) * pollMs < 2000 ? fastEvery : slowEvery
  if tick % every != 0 {
    Thread.sleep(forTimeInterval: pollMs / 1000)
    continue
  }

  autoreleasepool {
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
    var out: [[String: Any]] = []
    for w in list {
      let layer = w[kCGWindowLayer as String] as? Int ?? 0
      let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
      if pid == ownPid { continue }
      let owner = w[kCGWindowOwnerName as String] as? String ?? ""
      let alpha = w[kCGWindowAlpha as String] as? Double ?? 1
      if alpha < 0.05 { continue }
      guard let b = w[kCGWindowBounds as String] as? [String: Any],
            let x = (b["X"] as? NSNumber)?.doubleValue,
            let y = (b["Y"] as? NSNumber)?.doubleValue,
            let width = (b["Width"] as? NSNumber)?.doubleValue,
            let height = (b["Height"] as? NSNumber)?.doubleValue else { continue }
      if width < 60 || height < 40 { continue }

      var kind = ""
      if layer == 0 {
        kind = "window"
      } else if layer < 0 && widgetOwners.contains(owner) && width <= 900 && height <= 900 {
        kind = "widget"
      } else if layer > 0 && layer < 20 && !ignoredOwners.contains(owner) {
        kind = "panel"
      } else {
        continue
      }
      if kind != "widget" && ignoredOwners.contains(owner) { continue }

      let id = w[kCGWindowNumber as String] as? Int ?? 0
      out.append([
        "id": id, "pid": pid, "owner": owner, "kind": kind,
        "x": Int(x), "y": Int(y), "w": Int(width), "h": Int(height),
      ])
    }
    if let data = try? JSONSerialization.data(withJSONObject: out),
       let line = String(data: data, encoding: .utf8), line != last {
      last = line
      lastChange = tick
      print(line)
    }
  }
  Thread.sleep(forTimeInterval: pollMs / 1000)
}
