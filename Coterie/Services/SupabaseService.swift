import Foundation

// MARK: - Supabase Models

struct ObjectClass: Codable, Identifiable {
    let id: String
    let displayName: String
    let icon: String?
    let color: String?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case icon
        case color
    }
}

struct ObjectType: Codable, Identifiable {
    let id: String
    let displayName: String
    let objectClass: String
    let icon: String?
    let color: String?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case objectClass = "class"
        case icon
        case color
    }
}

struct GraphObject: Codable, Identifiable {
    let id: UUID
    let objectClass: String
    var name: String
    var data: [String: AnyCodable]
    var mapX: Double?
    var mapY: Double?
    let createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case objectClass = "class"
        case name, data
        case mapX = "map_x"
        case mapY = "map_y"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    // Convenience accessors for common data fields
    var website: String? {
        get { data["website"]?.value as? String }
    }

    var title: String? {
        get { data["title"]?.value as? String }
    }

    var notes: String? {
        get { data["notes"]?.value as? String }
    }

    var status: String? {
        get { data["status"]?.value as? String }
    }
}

struct ObjectTypeAssignment: Codable {
    let objectId: UUID
    let typeId: String
    let isPrimary: Bool?

    enum CodingKeys: String, CodingKey {
        case objectId = "object_id"
        case typeId = "type_id"
        case isPrimary = "is_primary"
    }
}

struct GraphRelationshipType: Codable, Identifiable {
    let id: String
    let displayName: String
    let validSourceClasses: [String]?
    let validTargetClasses: [String]?
    let icon: String?
    let color: String?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case validSourceClasses = "valid_source_classes"
        case validTargetClasses = "valid_target_classes"
        case icon
        case color
    }
}

struct GraphRelationship: Codable, Identifiable {
    let id: UUID
    let sourceId: UUID
    let targetId: UUID
    let type: String
    var data: [String: AnyCodable]
    let createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case sourceId = "source_id"
        case targetId = "target_id"
        case type, data
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct GraphLogEntry: Codable, Identifiable {
    let id: UUID
    var content: String
    var entryDate: Date?
    var linkedObjects: [UUID]
    let createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, content
        case entryDate = "entry_date"
        case linkedObjects = "linked_objects"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - AnyCodable for flexible JSONB fields

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unable to decode value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case let string as String:
            try container.encode(string)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let bool as Bool:
            try container.encode(bool)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        case is NSNull:
            try container.encodeNil()
        default:
            throw EncodingError.invalidValue(value, EncodingError.Context(codingPath: encoder.codingPath, debugDescription: "Unable to encode value"))
        }
    }
}

// MARK: - Supabase Service

@MainActor
class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    @Published var objects: [GraphObject] = []
    @Published var relationships: [GraphRelationship] = []
    @Published var objectClasses: [ObjectClass] = []
    @Published var objectTypes: [ObjectType] = []
    @Published var typeAssignments: [ObjectTypeAssignment] = []
    @Published var relationshipTypes: [GraphRelationshipType] = []
    @Published var isLoading = false
    @Published var lastError: String?

    private var baseURL: String {
        UserDefaults.standard.string(forKey: "supabaseUrl") ?? "http://127.0.0.1:54321"
    }

    private var apiKey: String {
        UserDefaults.standard.string(forKey: "supabaseAnonKey") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
    }

    // MARK: - API Helpers

    private func request(_ endpoint: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        guard let url = URL(string: "\(baseURL)/rest/v1/\(endpoint)") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")

        if let body = body {
            request.httpBody = body
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        if httpResponse.statusCode >= 400 {
            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NSError(domain: "Supabase", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMessage])
        }

        return data
    }

    // MARK: - Fetch All

    func fetchAll() async {
        isLoading = true
        lastError = nil

        do {
            async let classesData = request("object_classes?select=*")
            async let typesData = request("object_types?select=*")
            async let objectsData = request("objects?select=*&order=name")
            async let assignmentsData = request("object_type_assignments?select=*")
            async let relTypesData = request("relationship_types?select=*")
            async let relsData = request("relationships?select=*")

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            objectClasses = try decoder.decode([ObjectClass].self, from: await classesData)
            objectTypes = try decoder.decode([ObjectType].self, from: await typesData)
            objects = try decoder.decode([GraphObject].self, from: await objectsData)
            typeAssignments = try decoder.decode([ObjectTypeAssignment].self, from: await assignmentsData)
            relationshipTypes = try decoder.decode([GraphRelationshipType].self, from: await relTypesData)
            relationships = try decoder.decode([GraphRelationship].self, from: await relsData)

        } catch {
            lastError = error.localizedDescription
            print("Supabase fetch error: \(error)")
        }

        isLoading = false
    }

    // MARK: - Objects CRUD

    func createObject(objectClass: String, name: String, types: [String] = [], data: [String: Any] = [:]) async throws -> GraphObject {
        let payload: [String: Any] = [
            "class": objectClass,
            "name": name,
            "data": data
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: payload)
        let responseData = try await request("objects", method: "POST", body: jsonData)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let created = try decoder.decode([GraphObject].self, from: responseData)

        guard let obj = created.first else {
            throw NSError(domain: "Supabase", code: 0, userInfo: [NSLocalizedDescriptionKey: "No object returned"])
        }

        objects.append(obj)

        // Assign types
        for typeId in types {
            try await assignType(objectId: obj.id, typeId: typeId)
        }

        return obj
    }

    func updateObject(_ object: GraphObject) async throws {
        let payload: [String: Any] = [
            "name": object.name,
            "data": object.data.mapValues { $0.value },
            "map_x": object.mapX as Any,
            "map_y": object.mapY as Any
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: payload)
        _ = try await request("objects?id=eq.\(object.id)", method: "PATCH", body: jsonData)

        if let index = objects.firstIndex(where: { $0.id == object.id }) {
            objects[index] = object
        }
    }

    func deleteObject(_ object: GraphObject) async throws {
        _ = try await request("objects?id=eq.\(object.id)", method: "DELETE")
        objects.removeAll { $0.id == object.id }
        typeAssignments.removeAll { $0.objectId == object.id }
    }

    // MARK: - Type Assignments

    func assignType(objectId: UUID, typeId: String, isPrimary: Bool = false) async throws {
        let payload: [String: Any] = [
            "object_id": objectId.uuidString,
            "type_id": typeId,
            "is_primary": isPrimary
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: payload)
        let responseData = try await request("object_type_assignments", method: "POST", body: jsonData)

        let decoder = JSONDecoder()
        let created = try decoder.decode([ObjectTypeAssignment].self, from: responseData)

        if let assignment = created.first {
            typeAssignments.append(assignment)
        }
    }

    func removeType(objectId: UUID, typeId: String) async throws {
        _ = try await request("object_type_assignments?object_id=eq.\(objectId)&type_id=eq.\(typeId)", method: "DELETE")
        typeAssignments.removeAll { $0.objectId == objectId && $0.typeId == typeId }
    }

    func typesForObject(_ objectId: UUID) -> [ObjectType] {
        let typeIds = typeAssignments.filter { $0.objectId == objectId }.map { $0.typeId }
        return objectTypes.filter { typeIds.contains($0.id) }
    }

    // MARK: - Relationships CRUD

    func createRelationship(sourceId: UUID, targetId: UUID, type: String, data: [String: Any] = [:]) async throws -> GraphRelationship {
        let payload: [String: Any] = [
            "source_id": sourceId.uuidString,
            "target_id": targetId.uuidString,
            "type": type,
            "data": data
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: payload)
        let responseData = try await request("relationships", method: "POST", body: jsonData)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let created = try decoder.decode([GraphRelationship].self, from: responseData)

        if let rel = created.first {
            relationships.append(rel)
            return rel
        }
        throw NSError(domain: "Supabase", code: 0, userInfo: [NSLocalizedDescriptionKey: "No relationship returned"])
    }

    func deleteRelationship(_ relationship: GraphRelationship) async throws {
        _ = try await request("relationships?id=eq.\(relationship.id)", method: "DELETE")
        relationships.removeAll { $0.id == relationship.id }
    }

    // MARK: - Convenience Queries

    func objects(ofClass objectClass: String) -> [GraphObject] {
        objects.filter { $0.objectClass == objectClass }
    }

    func objects(withType typeId: String) -> [GraphObject] {
        let objectIds = typeAssignments.filter { $0.typeId == typeId }.map { $0.objectId }
        return objects.filter { objectIds.contains($0.id) }
    }

    func relationships(for objectId: UUID) -> [GraphRelationship] {
        relationships.filter { $0.sourceId == objectId || $0.targetId == objectId }
    }

    func relatedObjects(for objectId: UUID) -> [(relationship: GraphRelationship, object: GraphObject, direction: String)] {
        var results: [(GraphRelationship, GraphObject, String)] = []

        for rel in relationships {
            if rel.sourceId == objectId, let target = objects.first(where: { $0.id == rel.targetId }) {
                results.append((rel, target, "outgoing"))
            } else if rel.targetId == objectId, let source = objects.first(where: { $0.id == rel.sourceId }) {
                results.append((rel, source, "incoming"))
            }
        }

        return results
    }

    func typesForClass(_ classId: String) -> [ObjectType] {
        objectTypes.filter { $0.objectClass == classId }
    }
}
