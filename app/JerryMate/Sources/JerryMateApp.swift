import SwiftUI
import Combine

@main
struct JerryMateApp: App {
    @StateObject private var jerry = JerryManager()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(jerry: jerry)
        } label: {
            let iconImage: NSImage? = {
                // Try bundle first, then hardcoded path
                let paths = [
                    Bundle.main.path(forResource: "menubar_icon", ofType: "png"),
                    "/Applications/JerryMate.app/Contents/Resources/menubar_icon.png",
                ].compactMap { $0 }
                for p in paths {
                    if let img = NSImage(contentsOfFile: p) {
                        img.size = NSSize(width: 18, height: 18)
                        img.isTemplate = false
                        return img
                    }
                }
                return nil
            }()
            HStack(spacing: 4) {
                if let img = iconImage {
                    Image(nsImage: img)
                        .opacity(jerry.isRunning ? 1.0 : 0.4)
                } else {
                    Image(systemName: "circle.fill")
                        .foregroundStyle(jerry.isRunning ? .green : .red)
                }
            }
        }
        .menuBarExtraStyle(.window)
    }
}

struct MenuBarView: View {
    @ObservedObject var jerry: JerryManager

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "brain.filled.head.profile")
                    .font(.title2)
                    .foregroundStyle(jerry.isRunning ? .green : .red)
                VStack(alignment: .leading) {
                    Text("Jerry Mate")
                        .font(.headline)
                    Text(jerry.isRunning ? "Running" : "Stopped")
                        .font(.caption)
                        .foregroundStyle(jerry.isRunning ? .green : .red)
                }
                Spacer()
            }
            .padding(.bjerrym, 4)

            Divider()

            // Stats
            if jerry.isRunning {
                VStack(alignment: .leading, spacing: 6) {
                    StatusRow(icon: "clock", label: "Uptime", value: jerry.uptime)
                    StatusRow(icon: "message", label: "Messages", value: "\(jerry.messageCount)")
                    StatusRow(icon: "brain", label: "Last Activity", value: jerry.lastActivity)
                    StatusRow(icon: "heart.fill", label: "Next Heartbeat", value: jerry.nextHeartbeat)
                }
            }

            Divider()

            // Controls
            Button(action: { jerry.isRunning ? jerry.stop() : jerry.start() }) {
                Label(jerry.isRunning ? "Stop Jerry" : "Start Jerry",
                      systemImage: jerry.isRunning ? "stop.circle" : "play.circle")
            }
            .buttonStyle(.borderedProminent)
            .tint(jerry.isRunning ? .red : .green)
            .controlSize(.regular)

            Button(action: jerry.openTelegram) {
                Label("Open Telegram", systemImage: "paperplane")
            }

            Button(action: jerry.openLogs) {
                Label("View Logs", systemImage: "doc.text")
            }

            Divider()

            // Recent log lines
            if !jerry.recentLogs.isEmpty {
                Text("Recent Activity")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(jerry.recentLogs.suffix(3), id: \.self) { line in
                    Text(line)
                        .font(.system(size: 10, design: .monospaced))
                        .lineLimit(1)
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            Button("Quit") {
                jerry.stop()
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .padding()
        .frame(width: 300)
    }
}

struct StatusRow: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 16)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
        }
    }
}

// MARK: - Jerry Process Manager

class JerryManager: ObservableObject {
    @Published var isRunning = false
    @Published var messageCount = 0
    @Published var lastActivity = "—"
    @Published var nextHeartbeat = "—"
    @Published var uptime = "—"
    @Published var recentLogs: [String] = []

    private var process: Process?
    private var logPipe: Pipe?
    private var timer: Timer?
    private var startTime: Date?

    private let cooDir = "/Users/jerrymate/jerry"
    private let logFile = "/Users/jerrymate/jerry/logs/jerry.log"
    private let tsxPath = "/opt/homebrew/bin/npx"
    private let pidFile = "/Users/jerrymate/jerry/jerry/jerry.pid"

    init() {
        checkIfRunning()
        // Poll status every 5 seconds
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.checkIfRunning()
            self?.updateStats()
        }
    }

    func start() {
        // If a process is already alive (started externally), adopt it instead of spawning a second one
        if let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
           let pid = Int32(pidStr), kill(pid, 0) == 0 {
            DispatchQueue.main.async {
                self.isRunning = true
                if self.startTime == nil { self.startTime = Date() }
            }
            return
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: tsxPath)
        proc.arguments = ["tsx", "src/index.ts"]
        proc.currentDirectoryURL = URL(fileURLWithPath: cooDir)
        proc.environment = ProcessInfo.processInfo.environment
        proc.environment?["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Users/jerrymate/.local/bin"
        proc.environment?["HOME"] = "/Users/jerrymate"

        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        logPipe = pipe

        // Read logs async
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    self?.recentLogs.append(trimmed)
                    if (self?.recentLogs.count ?? 0) > 20 {
                        self?.recentLogs.removeFirst()
                    }
                    // Count messages
                    if trimmed.contains("Inbound message") {
                        self?.messageCount += 1
                        self?.lastActivity = Self.timeString()
                    }
                }
            }
        }

        proc.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.isRunning = false
                self?.startTime = nil
            }
        }

        do {
            try proc.run()
            process = proc
            startTime = Date()
            isRunning = true
        } catch {
            print("Failed to start Jerry: \(error)")
        }
    }

    func stop() {
        process?.terminate()
        process = nil
        isRunning = false
        startTime = nil
        // Also kill any orphaned processes
        let killTask = Process()
        killTask.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        killTask.arguments = ["-f", "tsx.*src/index.ts"]
        try? killTask.run()
    }

    func openTelegram() {
        // TODO: Update to Discord link when Discord bot is set up
        NSWorkspace.shared.open(URL(string: "https://discord.com")!)
    }

    func openLogs() {
        NSWorkspace.shared.open(URL(fileURLWithPath: logFile))
    }

    private func checkIfRunning() {
        // Read PID file written by the daemon on startup
        guard let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
              let pid = Int32(pidStr) else {
            DispatchQueue.main.async { self.isRunning = false }
            return
        }
        // kill(pid, 0) returns 0 if the process exists
        let alive = kill(pid, 0) == 0
        DispatchQueue.main.async { self.isRunning = alive }
    }

    private func updateStats() {
        if let start = startTime {
            let elapsed = Int(Date().timeIntervalSince(start))
            let hours = elapsed / 3600
            let minutes = (elapsed % 3600) / 60
            uptime = hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
        }

        // Calculate next heartbeat (simple: next hour mark)
        let cal = Calendar.current
        let now = Date()
        let nextHour = cal.nextDate(after: now, matching: DateComponents(minute: 0), matchingPolicy: .nextTime)
        if let next = nextHour {
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"
            nextHeartbeat = formatter.string(from: next)
        }
    }

    private static func timeString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: Date())
    }
}
