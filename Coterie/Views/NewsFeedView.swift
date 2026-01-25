import SwiftUI

struct NewsFeedView: View {
    @StateObject private var feedService = RSSFeedService()
    @State private var showMyFeed = true
    @State private var showingSourcePicker = false
    @State private var searchText = ""
    @AppStorage("useAIFiltering") private var useAIFiltering = true
    @AppStorage("selectedFeedURLs") private var selectedFeedURLsString: String = ""

    private var selectedFeeds: Set<URL> {
        get {
            if selectedFeedURLsString.isEmpty {
                // Default to all feeds
                return Set(IndustryFeed.hollywood.map { $0.url })
            }
            let urls = selectedFeedURLsString.split(separator: ",").compactMap { URL(string: String($0)) }
            return Set(urls)
        }
    }

    private func setSelectedFeeds(_ feeds: Set<URL>) {
        selectedFeedURLsString = feeds.map { $0.absoluteString }.joined(separator: ",")
    }

    private func toggleFeed(_ url: URL) {
        var feeds = selectedFeeds
        if feeds.contains(url) {
            feeds.remove(url)
        } else {
            feeds.insert(url)
        }
        setSelectedFeeds(feeds)
    }

    private var hasAPIKey: Bool {
        KeychainHelper.shared.getAnthropicAPIKey() != nil
    }

    private var shouldUseAI: Bool {
        hasAPIKey && useAIFiltering
    }

    private var isSearching: Bool {
        !searchText.isEmpty
    }

    private var startOfToday: Date {
        Calendar.current.startOfDay(for: Date())
    }

    private var todaysItems: [RSSItem] {
        feedService.allItems.filter { item in
            guard let pubDate = item.pubDate else { return false }
            return pubDate >= startOfToday
        }
    }

    var filteredItems: [RSSItem] {
        // If searching, search all of today's news regardless of My Feed toggle
        if isSearching {
            return todaysItems.filter { item in
                item.title.localizedCaseInsensitiveContains(searchText) ||
                item.summary.localizedCaseInsensitiveContains(searchText)
            }
        }

        if showMyFeed {
            return todaysItems.filter { feedService.isItemMapRelevant($0, useAI: shouldUseAI) }
        }
        return todaysItems
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Feed selector bar
                HStack(spacing: 12) {
                    // My Feed / All News toggle
                    HStack(spacing: 0) {
                        FeedModeButton(
                            title: "My Feed",
                            isSelected: showMyFeed,
                            showAIBadge: shouldUseAI,
                            isClassifying: feedService.isClassifying
                        ) {
                            showMyFeed = true
                        }

                        FeedModeButton(
                            title: "All News",
                            isSelected: !showMyFeed,
                            showAIBadge: false,
                            isClassifying: false
                        ) {
                            showMyFeed = false
                        }
                    }
                    .background(Color.secondary.opacity(0.15))
                    .cornerRadius(8)

                    Spacer()

                    // Source filter button
                    Button(action: { showingSourcePicker.toggle() }) {
                        HStack(spacing: 4) {
                            Image(systemName: "newspaper")
                            Text("\(selectedFeeds.count)")
                                .font(.caption)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.secondary.opacity(0.15))
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showingSourcePicker) {
                        SourcePickerView(
                            selectedFeeds: selectedFeeds,
                            onToggle: toggleFeed,
                            onSelectAll: { setSelectedFeeds(Set(IndustryFeed.hollywood.map { $0.url })) },
                            onClearAll: { setSelectedFeeds([]) }
                        )
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)

                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search all news...", text: $searchText)
                        .textFieldStyle(.plain)
                    if !searchText.isEmpty {
                        Button(action: { searchText = "" }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(8)
                .background(Color.secondary.opacity(0.1))
                .cornerRadius(8)
                .padding(.horizontal)
                .padding(.bottom, 8)

                Divider()

                // News items
                if feedService.isLoading {
                    Spacer()
                    ProgressView("Loading feeds...")
                    Spacer()
                } else if feedService.allItems.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "newspaper")
                            .font(.system(size: 48))
                            .foregroundStyle(.secondary)
                        Text("No news loaded")
                            .font(.headline)
                        Text("Click Refresh to fetch the latest headlines")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                } else if filteredItems.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        if isSearching {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 48))
                                .foregroundStyle(.secondary)
                            Text("No results for \"\(searchText)\"")
                                .font(.headline)
                            Text("Try a different search term")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Image(systemName: showMyFeed ? "sparkles" : "newspaper")
                                .font(.system(size: 48))
                                .foregroundStyle(.secondary)
                            Text(showMyFeed ? "No map-relevant news" : "No news loaded")
                                .font(.headline)
                            Text(showMyFeed ? "No personnel changes, project setups, or deals detected" : "Click Refresh to fetch the latest headlines")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                } else {
                    List(filteredItems) { item in
                        NewsItemRow(
                            item: item,
                            showRelevance: showMyFeed && !isSearching,
                            categories: feedService.itemCategories(item, useAI: shouldUseAI)
                        )
                    }
                }
            }
            .navigationTitle("Today's News")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: refreshFeeds) {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .disabled(feedService.isLoading || feedService.isClassifying)
                }
            }
        }
    }

    func refreshFeeds() {
        Task {
            await feedService.fetchAllFeeds(Array(selectedFeeds))

            // Run AI classification if enabled
            if shouldUseAI {
                await feedService.classifyItemsWithAI()
            }
        }
    }
}

struct FeedModeButton: View {
    let title: String
    let isSelected: Bool
    var showAIBadge: Bool = false
    var isClassifying: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(isSelected ? .semibold : .regular)

                if showAIBadge {
                    HStack(spacing: 2) {
                        Image(systemName: "sparkles")
                            .font(.caption2)
                        if isClassifying {
                            ProgressView()
                                .scaleEffect(0.5)
                        }
                    }
                    .foregroundColor(.purple)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? Color.accentColor : Color.clear)
            .foregroundColor(isSelected ? .white : .primary)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }
}

struct SourcePickerView: View {
    let selectedFeeds: Set<URL>
    let onToggle: (URL) -> Void
    let onSelectAll: () -> Void
    let onClearAll: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("News Sources")
                    .font(.headline)
                Spacer()
                Button("Done") {
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
            .padding()

            Divider()

            List {
                ForEach(IndustryFeed.hollywood) { feed in
                    HStack {
                        Toggle(isOn: Binding(
                            get: { selectedFeeds.contains(feed.url) },
                            set: { _ in onToggle(feed.url) }
                        )) {
                            VStack(alignment: .leading) {
                                Text(feed.name)
                                    .font(.body)
                                Text(feed.category)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)

            Divider()

            HStack {
                Button("Select All", action: onSelectAll)
                Button("Clear All", action: onClearAll)
                    .foregroundColor(.red)
            }
            .padding()
        }
        .frame(width: 280, height: 350)
    }
}

struct NewsItemRow: View {
    let item: RSSItem
    var showRelevance: Bool = false
    var categories: Set<RSSItem.MapRelevanceType> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(item.title)
                .font(.headline)
                .lineLimit(2)

            if !item.summary.isEmpty {
                Text(item.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            HStack {
                if let date = item.pubDate {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                if showRelevance && !categories.isEmpty {
                    ForEach(Array(categories).sorted(by: { $0.rawValue < $1.rawValue }), id: \.self) { type in
                        RelevanceBadge(type: type)
                    }
                }

                Spacer()

                if let link = item.link {
                    Link(destination: link) {
                        Label("Read", systemImage: "arrow.up.right.square")
                            .font(.caption2)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct RelevanceBadge: View {
    let type: RSSItem.MapRelevanceType

    var color: Color {
        switch type {
        case .personnel: return .blue
        case .project: return .green
        case .deal: return .orange
        }
    }

    var icon: String {
        switch type {
        case .personnel: return "person.fill"
        case .project: return "film"
        case .deal: return "building.2"
        }
    }

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: icon)
            Text(type.rawValue)
        }
        .font(.caption2)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(color.opacity(0.2))
        .foregroundColor(color)
        .cornerRadius(4)
    }
}

#Preview {
    NewsFeedView()
}
