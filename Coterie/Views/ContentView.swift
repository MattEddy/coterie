import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var companies: [Company]

    @State private var selectedTab: SidebarItem = .map
    @State private var showingSetupWizard = false
    @AppStorage("hasCompletedSetup") private var hasCompletedSetup = false

    enum SidebarItem: String, CaseIterable {
        case map = "Map"
        case news = "Today's News"
        case companies = "Companies"
        case people = "People"
        case projects = "Projects"
        case log = "Log"

        var icon: String {
            switch self {
            case .news: return "newspaper"
            case .map: return "map"
            case .companies: return "building.2"
            case .people: return "person.2"
            case .projects: return "film"
            case .log: return "note.text"
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            List(SidebarItem.allCases, id: \.self, selection: $selectedTab) { item in
                Label(item.rawValue, systemImage: item.icon)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200)
            .navigationTitle("Coterie")
            .toolbar {
                ToolbarItem {
                    Button(action: { showingSetupWizard = true }) {
                        Label("Import Landscape", systemImage: "square.and.arrow.down")
                    }
                    .help("Import Known Landscape")
                }
            }
        } detail: {
            switch selectedTab {
            case .news:
                NewsFeedView()
            case .map:
                MapView()
            case .companies:
                CompaniesView()
            case .people:
                PeopleView()
            case .projects:
                ProjectsView()
            case .log:
                LogView()
            }
        }
        .sheet(isPresented: $showingSetupWizard) {
            SetupWizardView()
                .onDisappear {
                    hasCompletedSetup = true
                }
        }
        .onAppear {
            // Show wizard on first launch if no data exists
            if !hasCompletedSetup && companies.isEmpty {
                showingSetupWizard = true
            }
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(for: [Company.self, Person.self, Project.self, Relationship.self, LogEntry.self], inMemory: true)
}
