import Foundation

// MARK: - RSS Feed Models

struct RSSFeed {
    let title: String
    let url: URL
    let items: [RSSItem]
}

struct RSSItem: Identifiable {
    let id = UUID()
    let title: String
    let link: URL?
    let pubDate: Date?
    let description: String?

    var summary: String {
        // Strip HTML tags from description
        guard let desc = description else { return "" }
        return desc.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Map Relevance Detection

    enum MapRelevanceType: String, CaseIterable {
        case personnel = "Personnel"
        case project = "Project"
        case deal = "Deal"
    }

    var mapRelevance: Set<MapRelevanceType> {
        let text = (title + " " + (description ?? "")).lowercased()
        var types: Set<MapRelevanceType> = []

        // Personnel changes
        let personnelKeywords = [
            "hired", "hires", "hiring", "joins", "joined", "joining",
            "appointed", "appoints", "names", "named", "naming",
            "promotes", "promoted", "promotion", "elevated",
            "exits", "exiting", "departs", "departed", "departing", "leaves", "leaving", "left",
            "fired", "ousted", "steps down", "stepping down", "resigns", "resigned",
            "new president", "new ceo", "new chief", "new head of", "new evp", "new svp",
            "taps", "upped to", "moves to"
        ]
        if personnelKeywords.contains(where: { text.contains($0) }) {
            types.insert(.personnel)
        }

        // Project setups
        let projectKeywords = [
            "greenlit", "greenlights", "greenlight", "green-lit", "green lit",
            "set up", "sets up", "setting up", "set at", "sets at",
            "in development", "into development", "development deal",
            "ordered to series", "series order", "straight-to-series",
            "pilot order", "orders pilot", "ordered pilot",
            "acquires rights", "acquired rights", "picks up", "picked up",
            "adaptation", "adapting", "to adapt", "remake", "reboot",
            "attached to", "to direct", "to write", "to star", "to produce",
            "boards", "boarding", "circling"
        ]
        if projectKeywords.contains(where: { text.contains($0) }) {
            types.insert(.project)
        }

        // Company deals/M&A
        let dealKeywords = [
            "acquires", "acquired", "acquisition", "to acquire",
            "merger", "merges", "merged", "merging",
            "buys", "bought", "purchase", "purchased",
            "sells", "sold", "sale of", "divests",
            "first-look", "first look", "overall deal", "pod deal",
            "signs with", "signed with", "inks deal", "extends deal", "renews deal",
            "restructur", "layoff", "lay off", "cuts staff", "downsiz"
        ]
        if dealKeywords.contains(where: { text.contains($0) }) {
            types.insert(.deal)
        }

        return types
    }

    var isMapRelevant: Bool {
        !mapRelevance.isEmpty
    }
}

// MARK: - Known Industry Feeds

struct IndustryFeed: Identifiable {
    let id = UUID()
    let name: String
    let url: URL
    let category: String

    static let hollywood: [IndustryFeed] = [
        IndustryFeed(name: "Deadline", url: URL(string: "https://deadline.com/feed/")!, category: "Trade"),
        IndustryFeed(name: "Variety", url: URL(string: "https://variety.com/feed/")!, category: "Trade"),
        IndustryFeed(name: "Hollywood Reporter", url: URL(string: "https://www.hollywoodreporter.com/feed/")!, category: "Trade"),
        IndustryFeed(name: "The Wrap", url: URL(string: "https://www.thewrap.com/feed/")!, category: "Trade"),
        IndustryFeed(name: "IndieWire", url: URL(string: "https://www.indiewire.com/feed/")!, category: "Indie"),
        IndustryFeed(name: "Screen Daily", url: URL(string: "https://www.screendaily.com/feed")!, category: "International"),
    ]
}

// MARK: - RSS Parser

class RSSParser: NSObject, XMLParserDelegate {
    private var currentElement = ""
    private var currentTitle = ""
    private var currentLink = ""
    private var currentDescription = ""
    private var currentPubDate = ""

    private var items: [RSSItem] = []
    private var feedTitle = ""
    private var isInsideItem = false

    func parse(data: Data, feedURL: URL) -> RSSFeed? {
        let parser = XMLParser(data: data)
        parser.delegate = self

        if parser.parse() {
            return RSSFeed(title: feedTitle, url: feedURL, items: items)
        }
        return nil
    }

    // MARK: XMLParserDelegate

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String : String] = [:]) {
        currentElement = elementName

        if elementName == "item" {
            isInsideItem = true
            currentTitle = ""
            currentLink = ""
            currentDescription = ""
            currentPubDate = ""
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        switch currentElement {
        case "title":
            if isInsideItem {
                currentTitle += trimmed
            } else {
                feedTitle += trimmed
            }
        case "link":
            if isInsideItem {
                currentLink += trimmed
            }
        case "description":
            if isInsideItem {
                currentDescription += trimmed
            }
        case "pubDate":
            if isInsideItem {
                currentPubDate += trimmed
            }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if elementName == "item" {
            let item = RSSItem(
                title: currentTitle,
                link: URL(string: currentLink),
                pubDate: parseDate(currentPubDate),
                description: currentDescription
            )
            items.append(item)
            isInsideItem = false
        }
    }

    private func parseDate(_ string: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")

        // Try common RSS date formats
        let formats = [
            "EEE, dd MMM yyyy HH:mm:ss Z",
            "EEE, dd MMM yyyy HH:mm:ss zzz",
            "yyyy-MM-dd'T'HH:mm:ssZ"
        ]

        for format in formats {
            formatter.dateFormat = format
            if let date = formatter.date(from: string) {
                return date
            }
        }
        return nil
    }
}

// MARK: - RSS Feed Service

@MainActor
class RSSFeedService: ObservableObject {
    @Published var feeds: [URL: [RSSItem]] = [:]
    @Published var isLoading = false
    @Published var lastError: String?
    @Published var aiClassifications: [UUID: AIClassificationResult] = [:]
    @Published var isClassifying = false

    private let parser = RSSParser()

    struct AIClassificationResult {
        let isRelevant: Bool
        let categories: Set<RSSItem.MapRelevanceType>
        let entities: ClaudeAPIService.ExtractedEntities?
    }

    func fetchFeed(from url: URL) async -> [RSSItem] {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)

            let parserInstance = RSSParser()
            if let feed = parserInstance.parse(data: data, feedURL: url) {
                feeds[url] = feed.items
                return feed.items
            }
        } catch {
            lastError = error.localizedDescription
        }
        return []
    }

    func fetchAllFeeds(_ feedURLs: [URL]) async {
        isLoading = true
        lastError = nil

        await withTaskGroup(of: (URL, [RSSItem]).self) { group in
            for url in feedURLs {
                group.addTask {
                    let items = await self.fetchFeed(from: url)
                    return (url, items)
                }
            }

            for await (url, items) in group {
                feeds[url] = items
            }
        }

        isLoading = false
    }

    var allItems: [RSSItem] {
        feeds.values.flatMap { $0 }.sorted { ($0.pubDate ?? .distantPast) > ($1.pubDate ?? .distantPast) }
    }

    var recentItems: [RSSItem] {
        let oneDayAgo = Date().addingTimeInterval(-86400)
        return allItems.filter { ($0.pubDate ?? .distantPast) > oneDayAgo }
    }

    // MARK: - AI Classification

    func classifyItemsWithAI() async {
        guard KeychainHelper.shared.getAnthropicAPIKey() != nil else { return }

        isClassifying = true

        // Only classify items we haven't classified yet
        let itemsToClassify = allItems.filter { aiClassifications[$0.id] == nil }

        for item in itemsToClassify {
            let result = await item.classifyWithAI()
            aiClassifications[item.id] = AIClassificationResult(
                isRelevant: result.isRelevant,
                categories: result.categories,
                entities: result.entities
            )
        }

        isClassifying = false
    }

    func isItemMapRelevant(_ item: RSSItem, useAI: Bool) -> Bool {
        if useAI, let aiResult = aiClassifications[item.id] {
            return aiResult.isRelevant
        }
        return item.isMapRelevant
    }

    func itemCategories(_ item: RSSItem, useAI: Bool) -> Set<RSSItem.MapRelevanceType> {
        if useAI, let aiResult = aiClassifications[item.id] {
            return aiResult.categories
        }
        return item.mapRelevance
    }
}
