import SwiftUI
import SwiftData

@main
struct CoterieApp: App {
    init() {
        // Initialize local database on app launch
        Task { @MainActor in
            await LocalDatabase.shared.fetchAll()
        }
    }

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Company.self,
            Division.self,
            Person.self,
            Project.self,
            Relationship.self,
            LogEntry.self
        ])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(sharedModelContainer)

        #if os(macOS)
        Settings {
            SettingsView()
        }
        #endif
    }
}
