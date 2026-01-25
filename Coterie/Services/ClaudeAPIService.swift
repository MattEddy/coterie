import Foundation

// MARK: - Claude API Service

actor ClaudeAPIService {
    static let shared = ClaudeAPIService()

    private let baseURL = "https://api.anthropic.com/v1/messages"
    private let model = "claude-3-haiku-20240307" // Fast and cheap for classification

    enum ClassificationError: Error {
        case noAPIKey
        case invalidResponse
        case networkError(Error)
        case apiError(String)
    }

    // MARK: - Article Classification

    struct ArticleClassification: Codable {
        let isMapRelevant: Bool
        let categories: [String] // "personnel", "project", "deal"
        let confidence: Double
        let entities: ExtractedEntities?
    }

    struct ExtractedEntities: Codable {
        let people: [String]?
        let companies: [String]?
        let projects: [String]?
    }

    func classifyArticle(title: String, description: String?) async throws -> ArticleClassification {
        guard let apiKey = KeychainHelper.shared.getAnthropicAPIKey() else {
            throw ClassificationError.noAPIKey
        }

        let prompt = buildClassificationPrompt(title: title, description: description)

        let response = try await callClaude(prompt: prompt, apiKey: apiKey)

        return try parseClassificationResponse(response)
    }

    func classifyArticles(_ articles: [(title: String, description: String?)]) async throws -> [ArticleClassification] {
        // Process in parallel with some concurrency limit
        try await withThrowingTaskGroup(of: (Int, ArticleClassification).self) { group in
            for (index, article) in articles.enumerated() {
                group.addTask {
                    let classification = try await self.classifyArticle(
                        title: article.title,
                        description: article.description
                    )
                    return (index, classification)
                }
            }

            var results = [(Int, ArticleClassification)]()
            for try await result in group {
                results.append(result)
            }

            return results.sorted { $0.0 < $1.0 }.map { $0.1 }
        }
    }

    // MARK: - Private Helpers

    private func buildClassificationPrompt(title: String, description: String?) -> String {
        let content = description.map { "\(title)\n\n\($0)" } ?? title

        return """
        Analyze this entertainment industry news headline and brief. Determine if it's relevant to tracking industry changes.

        ARTICLE:
        \(content)

        Classify as map-relevant if it mentions:
        - Personnel changes (hires, departures, promotions, new roles)
        - Project developments (greenlights, setups, attachments, acquisitions)
        - Company deals (M&A, overall deals, first-look deals, restructuring)

        Respond in JSON format only:
        {
          "isMapRelevant": true/false,
          "categories": ["personnel", "project", "deal"],
          "confidence": 0.0-1.0,
          "entities": {
            "people": ["Name 1", "Name 2"],
            "companies": ["Company 1"],
            "projects": ["Project Title"]
          }
        }

        Only include categories that apply. Extract entity names mentioned.
        """
    }

    private func callClaude(prompt: String, apiKey: String) async throws -> String {
        var request = URLRequest(url: URL(string: baseURL)!)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.addValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 256,
            "messages": [
                ["role": "user", "content": prompt]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClassificationError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw ClassificationError.apiError("HTTP \(httpResponse.statusCode): \(errorBody)")
        }

        // Parse the response to extract the text content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let firstBlock = content.first,
              let text = firstBlock["text"] as? String else {
            throw ClassificationError.invalidResponse
        }

        return text
    }

    private func parseClassificationResponse(_ response: String) throws -> ArticleClassification {
        // Extract JSON from response (Claude might include markdown formatting)
        let jsonString = response
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let data = jsonString.data(using: .utf8) else {
            throw ClassificationError.invalidResponse
        }

        let decoder = JSONDecoder()
        return try decoder.decode(ArticleClassification.self, from: data)
    }
}

// MARK: - RSSItem Extension for AI Classification

extension RSSItem {
    func classifyWithAI() async -> (isRelevant: Bool, categories: Set<MapRelevanceType>, entities: ClaudeAPIService.ExtractedEntities?) {
        do {
            let classification = try await ClaudeAPIService.shared.classifyArticle(
                title: title,
                description: description
            )

            var types: Set<MapRelevanceType> = []
            for category in classification.categories {
                switch category.lowercased() {
                case "personnel": types.insert(.personnel)
                case "project": types.insert(.project)
                case "deal": types.insert(.deal)
                default: break
                }
            }

            return (classification.isMapRelevant, types, classification.entities)
        } catch {
            // Fall back to keyword matching on error
            return (isMapRelevant, mapRelevance, nil)
        }
    }
}
