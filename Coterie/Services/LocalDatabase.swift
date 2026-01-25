import Foundation
import SQLite3

// MARK: - Local Database Service
// SQLite-based local storage for offline-first architecture
// Mirrors SupabaseService interface for easy swapping

@MainActor
class LocalDatabase: ObservableObject {
    static let shared = LocalDatabase()

    private var db: OpaquePointer?

    @Published var objects: [GraphObject] = []
    @Published var relationships: [GraphRelationship] = []
    @Published var objectClasses: [ObjectClass] = []
    @Published var objectTypes: [ObjectType] = []
    @Published var typeAssignments: [ObjectTypeAssignment] = []
    @Published var relationshipTypes: [GraphRelationshipType] = []
    @Published var isLoading = false
    @Published var lastError: String?

    private init() {
        print("LocalDatabase: Initializing at \(databasePath)")
        openDatabase()
        createTablesIfNeeded()
        seedReferenceDataIfNeeded()
    }

    deinit {
        sqlite3_close(db)
    }

    // MARK: - Database Setup

    private var databasePath: String {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appFolder = appSupport.appendingPathComponent("Coterie", isDirectory: true)

        // Create directory if needed
        try? fileManager.createDirectory(at: appFolder, withIntermediateDirectories: true)

        return appFolder.appendingPathComponent("coterie.db").path
    }

    private func openDatabase() {
        if sqlite3_open(databasePath, &db) != SQLITE_OK {
            lastError = "Failed to open database"
            print("LocalDatabase: Error - \(String(cString: sqlite3_errmsg(db)))")
        }
    }

    private func createTablesIfNeeded() {
        let schema = """
        -- Object Classes
        CREATE TABLE IF NOT EXISTS object_classes (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            icon TEXT,
            color TEXT
        );

        -- Object Types
        CREATE TABLE IF NOT EXISTS object_types (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            class TEXT NOT NULL REFERENCES object_classes(id),
            icon TEXT,
            color TEXT
        );

        -- Objects
        CREATE TABLE IF NOT EXISTS objects (
            id TEXT PRIMARY KEY,
            class TEXT NOT NULL REFERENCES object_classes(id),
            name TEXT NOT NULL,
            data TEXT DEFAULT '{}',
            map_x REAL,
            map_y REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Object Type Assignments
        CREATE TABLE IF NOT EXISTS object_type_assignments (
            object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
            type_id TEXT NOT NULL REFERENCES object_types(id),
            is_primary INTEGER DEFAULT 0,
            PRIMARY KEY (object_id, type_id)
        );

        -- Relationship Types
        CREATE TABLE IF NOT EXISTS relationship_types (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            valid_source_classes TEXT,
            valid_target_classes TEXT,
            icon TEXT,
            color TEXT
        );

        -- Relationships
        CREATE TABLE IF NOT EXISTS relationships (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
            target_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
            type TEXT NOT NULL REFERENCES relationship_types(id),
            data TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source_id, target_id, type)
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_objects_class ON objects(class);
        CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name);
        CREATE INDEX IF NOT EXISTS idx_type_assignments_type ON object_type_assignments(type_id);
        CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
        CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
        """

        executeStatements(schema, context: "schema")
    }

    private func seedReferenceDataIfNeeded() {
        // Check if already seeded
        var stmt: OpaquePointer?
        var alreadySeeded = false

        if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM object_classes", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                alreadySeeded = sqlite3_column_int(stmt, 0) > 0
            }
            sqlite3_finalize(stmt)
        }

        if alreadySeeded { return }

        // Seed object classes
        let classes = """
        INSERT INTO object_classes (id, display_name, icon, color) VALUES
            ('company', 'Company', 'building.2', '#3B82F6'),
            ('person', 'Person', 'person.fill', '#10B981'),
            ('project', 'Project', 'film', '#F59E0B');
        """

        // Seed object types
        let types = """
        INSERT INTO object_types (id, display_name, class, icon, color) VALUES
            ('studio', 'Studio', 'company', 'building.2.fill', '#3B82F6'),
            ('parent_company', 'Parent Company', 'company', 'building.columns', '#1E40AF'),
            ('network', 'Network', 'company', 'tv', '#7C3AED'),
            ('streamer', 'Streamer', 'company', 'play.tv', '#DC2626'),
            ('production_company', 'Production Company', 'company', 'film.stack', '#059669'),
            ('agency', 'Agency', 'company', 'person.3', '#EA580C'),
            ('management', 'Management', 'company', 'person.2', '#DB2777'),
            ('financier', 'Financier', 'company', 'dollarsign.circle', '#CA8A04'),
            ('distributor', 'Distributor', 'company', 'shippingbox', '#0891B2'),
            ('guild_union', 'Guild/Union', 'company', 'person.badge.shield.checkmark', '#6B7280'),
            ('executive', 'Executive', 'person', 'person.badge.key', '#1E40AF'),
            ('producer', 'Producer', 'person', 'person.crop.rectangle', '#7C3AED'),
            ('creative', 'Creative', 'person', 'pencil.and.outline', '#059669'),
            ('talent', 'Talent', 'person', 'star', '#CA8A04'),
            ('agent', 'Agent', 'person', 'briefcase', '#EA580C'),
            ('manager', 'Manager', 'person', 'person.badge.clock', '#DB2777'),
            ('lawyer', 'Lawyer', 'person', 'text.book.closed', '#6B7280'),
            ('investor', 'Investor', 'person', 'chart.line.uptrend.xyaxis', '#0891B2'),
            ('feature', 'Feature', 'project', 'film', '#F59E0B'),
            ('tv_series', 'TV Series', 'project', 'tv', '#7C3AED'),
            ('limited_series', 'Limited Series', 'project', 'tv.inset.filled', '#DC2626'),
            ('pilot', 'Pilot', 'project', 'play.rectangle', '#059669'),
            ('documentary', 'Documentary', 'project', 'doc.text.image', '#3B82F6'),
            ('short', 'Short', 'project', 'film.stack', '#6B7280'),
            ('unscripted', 'Unscripted', 'project', 'person.wave.2', '#EA580C');
        """

        // Seed relationship types
        let relTypes = """
        INSERT INTO relationship_types (id, display_name, valid_source_classes, valid_target_classes, icon) VALUES
            ('owns', 'Owns', 'company', 'company', 'arrow.down.circle'),
            ('division_of', 'Division Of', 'company', 'company', 'square.grid.2x2'),
            ('employed_by', 'Employed By', 'person', 'company', 'briefcase'),
            ('reports_to', 'Reports To', 'person', 'person', 'arrow.up.circle'),
            ('has_deal_at', 'Has Deal At', 'company', 'company', 'doc.text'),
            ('represents', 'Represents', 'company', 'person', 'person.badge.shield.checkmark'),
            ('represented_by', 'Represented By', 'person', 'company', 'person.badge.shield.checkmark'),
            ('set_up_at', 'Set Up At', 'project', 'company', 'building.2'),
            ('attached_to', 'Attached To', 'person', 'project', 'paperclip'),
            ('produces', 'Produces', 'company', 'project', 'film'),
            ('related_to', 'Related To', NULL, NULL, 'link');
        """

        executeStatements(classes, context: "object_classes")
        executeStatements(types, context: "object_types")
        executeStatements(relTypes, context: "relationship_types")
    }

    private func executeStatements(_ sql: String, context: String = "") {
        var errMsg: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &errMsg) != SQLITE_OK {
            let ctx = context.isEmpty ? "" : " (\(context))"
            if let errMsg = errMsg {
                print("LocalDatabase: SQL error\(ctx): \(String(cString: errMsg))")
                sqlite3_free(errMsg)
            }
        }
    }

    // MARK: - Fetch All

    func fetchAll() async {
        isLoading = true
        lastError = nil

        objectClasses = fetchObjectClasses()
        objectTypes = fetchObjectTypes()
        objects = fetchObjects()
        typeAssignments = fetchTypeAssignments()
        relationshipTypes = fetchRelationshipTypes()
        relationships = fetchRelationships()

        isLoading = false
    }

    private func fetchObjectClasses() -> [ObjectClass] {
        var results: [ObjectClass] = []
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, "SELECT id, display_name, icon, color FROM object_classes", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let id = String(cString: sqlite3_column_text(stmt, 0))
                let displayName = String(cString: sqlite3_column_text(stmt, 1))
                let icon = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
                let color = sqlite3_column_text(stmt, 3).map { String(cString: $0) }

                results.append(ObjectClass(id: id, displayName: displayName, icon: icon, color: color))
            }
        }
        sqlite3_finalize(stmt)
        return results
    }

    private func fetchObjectTypes() -> [ObjectType] {
        var results: [ObjectType] = []
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, "SELECT id, display_name, class, icon, color FROM object_types", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let id = String(cString: sqlite3_column_text(stmt, 0))
                let displayName = String(cString: sqlite3_column_text(stmt, 1))
                let objectClass = String(cString: sqlite3_column_text(stmt, 2))
                let icon = sqlite3_column_text(stmt, 3).map { String(cString: $0) }
                let color = sqlite3_column_text(stmt, 4).map { String(cString: $0) }

                results.append(ObjectType(id: id, displayName: displayName, objectClass: objectClass, icon: icon, color: color))
            }
        }
        sqlite3_finalize(stmt)
        return results
    }

    private func fetchObjects() -> [GraphObject] {
        var results: [GraphObject] = []
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, "SELECT id, class, name, data, map_x, map_y, created_at, updated_at FROM objects ORDER BY name", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let idStr = String(cString: sqlite3_column_text(stmt, 0))
                guard let id = UUID(uuidString: idStr) else { continue }

                let objectClass = String(cString: sqlite3_column_text(stmt, 1))
                let name = String(cString: sqlite3_column_text(stmt, 2))
                let dataStr = String(cString: sqlite3_column_text(stmt, 3))
                let data = parseJSON(dataStr)

                let mapX: Double? = sqlite3_column_type(stmt, 4) != SQLITE_NULL ? sqlite3_column_double(stmt, 4) : nil
                let mapY: Double? = sqlite3_column_type(stmt, 5) != SQLITE_NULL ? sqlite3_column_double(stmt, 5) : nil

                let createdAt = parseDate(sqlite3_column_text(stmt, 6))
                let updatedAt = parseDate(sqlite3_column_text(stmt, 7))

                results.append(GraphObject(
                    id: id,
                    objectClass: objectClass,
                    name: name,
                    data: data,
                    mapX: mapX,
                    mapY: mapY,
                    createdAt: createdAt,
                    updatedAt: updatedAt
                ))
            }
        }
        sqlite3_finalize(stmt)
        return results
    }

    private func fetchTypeAssignments() -> [ObjectTypeAssignment] {
        var results: [ObjectTypeAssignment] = []
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, "SELECT object_id, type_id, is_primary FROM object_type_assignments", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let objectIdStr = String(cString: sqlite3_column_text(stmt, 0))
                guard let objectId = UUID(uuidString: objectIdStr) else { continue }

                let typeId = String(cString: sqlite3_column_text(stmt, 1))
                let isPrimary = sqlite3_column_int(stmt, 2) == 1

                results.append(ObjectTypeAssignment(objectId: objectId, typeId: typeId, isPrimary: isPrimary))
            }
        }
        sqlite3_finalize(stmt)
        return results
    }

    private func fetchRelationshipTypes() -> [GraphRelationshipType] {
        var results: [GraphRelationshipType] = []
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, "SELECT id, display_name, valid_source_classes, valid_target_classes, icon, color FROM relationship_types", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let id = String(cString: sqlite3_column_text(stmt, 0))
                let displayName = String(cString: sqlite3_column_text(stmt, 1))
                let validSourceStr = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
                let validTargetStr = sqlite3_column_text(stmt, 3).map { String(cString: $0) }
                let icon = sqlite3_column_text(stmt, 4).map { String(cString: $0) }
                let color = sqlite3_column_text(stmt, 5).map { String(cString: $0) }

                let validSource = validSourceStr.map { [$0] }
                let validTarget = validTargetStr.map { [$0] }

                results.append(GraphRelationshipType(
                    id: id,
                    displayName: displayName,
                    validSourceClasses: validSource,
                    validTargetClasses: validTarget,
                    icon: icon,
                    color: color
                ))
            }
        }
        sqlite3_finalize(stmt)
        return results
    }

    private func fetchRelationships() -> [GraphRelationship] {
        var results: [GraphRelationship] = []
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, "SELECT id, source_id, target_id, type, data, created_at, updated_at FROM relationships", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let idStr = String(cString: sqlite3_column_text(stmt, 0))
                guard let id = UUID(uuidString: idStr) else { continue }

                let sourceIdStr = String(cString: sqlite3_column_text(stmt, 1))
                guard let sourceId = UUID(uuidString: sourceIdStr) else { continue }

                let targetIdStr = String(cString: sqlite3_column_text(stmt, 2))
                guard let targetId = UUID(uuidString: targetIdStr) else { continue }

                let type = String(cString: sqlite3_column_text(stmt, 3))
                let dataStr = String(cString: sqlite3_column_text(stmt, 4))
                let data = parseJSON(dataStr)

                let createdAt = parseDate(sqlite3_column_text(stmt, 5))
                let updatedAt = parseDate(sqlite3_column_text(stmt, 6))

                results.append(GraphRelationship(
                    id: id,
                    sourceId: sourceId,
                    targetId: targetId,
                    type: type,
                    data: data,
                    createdAt: createdAt,
                    updatedAt: updatedAt
                ))
            }
        }
        sqlite3_finalize(stmt)
        return results
    }

    // MARK: - Objects CRUD

    func createObject(objectClass: String, name: String, types: [String] = [], data: [String: Any] = [:]) async throws -> GraphObject {
        let id = UUID()
        let dataJSON = serializeJSON(data)
        let now = ISO8601DateFormatter().string(from: Date())

        let sql = "INSERT INTO objects (id, class, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, id.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 2, objectClass, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 3, name, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 4, dataJSON, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 5, now, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 6, now, -1, SQLITE_TRANSIENT)

            if sqlite3_step(stmt) != SQLITE_DONE {
                sqlite3_finalize(stmt)
                throw NSError(domain: "LocalDB", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to insert object"])
            }
        }
        sqlite3_finalize(stmt)

        let obj = GraphObject(
            id: id,
            objectClass: objectClass,
            name: name,
            data: data.mapValues { AnyCodable($0) },
            mapX: nil,
            mapY: nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        objects.append(obj)

        // Assign types
        for typeId in types {
            try await assignType(objectId: id, typeId: typeId)
        }

        return obj
    }

    func updateObject(_ object: GraphObject) async throws {
        let dataJSON = serializeJSON(object.data.mapValues { $0.value })
        let now = ISO8601DateFormatter().string(from: Date())

        let sql = "UPDATE objects SET name = ?, data = ?, map_x = ?, map_y = ?, updated_at = ? WHERE id = ?"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, object.name, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 2, dataJSON, -1, SQLITE_TRANSIENT)

            if let mapX = object.mapX {
                sqlite3_bind_double(stmt, 3, mapX)
            } else {
                sqlite3_bind_null(stmt, 3)
            }

            if let mapY = object.mapY {
                sqlite3_bind_double(stmt, 4, mapY)
            } else {
                sqlite3_bind_null(stmt, 4)
            }

            sqlite3_bind_text(stmt, 5, now, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 6, object.id.uuidString, -1, SQLITE_TRANSIENT)

            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)

        if let index = objects.firstIndex(where: { $0.id == object.id }) {
            objects[index] = object
        }
    }

    func deleteObject(_ object: GraphObject) async throws {
        let sql = "DELETE FROM objects WHERE id = ?"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, object.id.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)

        objects.removeAll { $0.id == object.id }
        typeAssignments.removeAll { $0.objectId == object.id }
    }

    // MARK: - Type Assignments

    func assignType(objectId: UUID, typeId: String, isPrimary: Bool = false) async throws {
        let sql = "INSERT OR REPLACE INTO object_type_assignments (object_id, type_id, is_primary) VALUES (?, ?, ?)"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, objectId.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 2, typeId, -1, SQLITE_TRANSIENT)
            sqlite3_bind_int(stmt, 3, isPrimary ? 1 : 0)
            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)

        // Update local cache
        if !typeAssignments.contains(where: { $0.objectId == objectId && $0.typeId == typeId }) {
            typeAssignments.append(ObjectTypeAssignment(objectId: objectId, typeId: typeId, isPrimary: isPrimary))
        }
    }

    func removeType(objectId: UUID, typeId: String) async throws {
        let sql = "DELETE FROM object_type_assignments WHERE object_id = ? AND type_id = ?"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, objectId.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 2, typeId, -1, SQLITE_TRANSIENT)
            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)

        typeAssignments.removeAll { $0.objectId == objectId && $0.typeId == typeId }
    }

    func typesForObject(_ objectId: UUID) -> [ObjectType] {
        let typeIds = typeAssignments.filter { $0.objectId == objectId }.map { $0.typeId }
        return objectTypes.filter { typeIds.contains($0.id) }
    }

    // MARK: - Relationships CRUD

    func createRelationship(sourceId: UUID, targetId: UUID, type: String, data: [String: Any] = [:]) async throws -> GraphRelationship {
        let id = UUID()
        let dataJSON = serializeJSON(data)
        let now = ISO8601DateFormatter().string(from: Date())

        let sql = "INSERT INTO relationships (id, source_id, target_id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, id.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 2, sourceId.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 3, targetId.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 4, type, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 5, dataJSON, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 6, now, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 7, now, -1, SQLITE_TRANSIENT)

            if sqlite3_step(stmt) != SQLITE_DONE {
                sqlite3_finalize(stmt)
                throw NSError(domain: "LocalDB", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to insert relationship"])
            }
        }
        sqlite3_finalize(stmt)

        let rel = GraphRelationship(
            id: id,
            sourceId: sourceId,
            targetId: targetId,
            type: type,
            data: data.mapValues { AnyCodable($0) },
            createdAt: Date(),
            updatedAt: Date()
        )

        relationships.append(rel)
        return rel
    }

    func deleteRelationship(_ relationship: GraphRelationship) async throws {
        let sql = "DELETE FROM relationships WHERE id = ?"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, relationship.id.uuidString, -1, SQLITE_TRANSIENT)
            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)

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

    // MARK: - Auto Layout

    func autoLayoutObjects() async {
        let canvasHeight: CGFloat = 3000
        let cardSpacingX: CGFloat = 220
        let cardSpacingY: CGFloat = 300    // 2.3x spacing for people around companies
        let columnGap: CGFloat = 400       // Space between type groups
        let maxPerColumn = 10              // Max items before wrapping to new column

        // Group companies by their primary type
        let companies = objects.filter { $0.objectClass == "company" }
        let people = objects.filter { $0.objectClass == "person" }
        let projects = objects.filter { $0.objectClass == "project" }

        // Define type order for columns (left to right)
        let typeOrder = ["studio", "streamer", "network", "production_company", "agency", "management", "financier", "distributor"]

        var typeGroups: [String: [GraphObject]] = [:]
        for typeId in typeOrder {
            typeGroups[typeId] = []
        }
        typeGroups["other"] = []

        // Assign companies to type groups
        for company in companies {
            let companyTypes = typesForObject(company.id)
            let primaryType = companyTypes.first?.id ?? "other"
            if typeGroups[primaryType] != nil {
                typeGroups[primaryType]?.append(company)
            } else {
                typeGroups["other"]?.append(company)
            }
        }

        // Calculate how many columns each type needs
        let activeTypes = typeOrder.filter { !(typeGroups[$0]?.isEmpty ?? true) } + (typeGroups["other"]?.isEmpty == false ? ["other"] : [])

        var positionUpdates: [(UUID, CGFloat, CGFloat)] = []
        var currentX: CGFloat = 300  // Starting X position

        // Layout companies in columns by type
        for typeId in activeTypes {
            guard let group = typeGroups[typeId], !group.isEmpty else { continue }

            let columnsNeeded = (group.count + maxPerColumn - 1) / maxPerColumn
            let itemsInLastColumn = group.count % maxPerColumn
            let fullColumns = columnsNeeded - (itemsInLastColumn > 0 ? 1 : 0)

            for (index, company) in group.enumerated() {
                let columnInGroup = index / maxPerColumn
                let rowInColumn = index % maxPerColumn

                // Calculate actual items in this column for vertical centering
                let itemsInThisColumn = (columnInGroup < fullColumns) ? maxPerColumn :
                    (itemsInLastColumn > 0 ? itemsInLastColumn : maxPerColumn)

                let x = currentX + CGFloat(columnInGroup) * cardSpacingX
                let startY = canvasHeight / 2 - CGFloat(itemsInThisColumn) * cardSpacingY / 2
                let y = startY + CGFloat(rowInColumn) * cardSpacingY

                positionUpdates.append((company.id, x, y))
            }

            // Move currentX past this type's columns plus gap
            currentX += CGFloat(columnsNeeded) * cardSpacingX + columnGap
        }

        // Layout people near their employers (below and to the right)
        var placedPeople: Set<UUID> = []
        var employerPeopleCount: [UUID: Int] = [:]  // Track how many people placed per employer

        for person in people {
            let rels = relationships.filter { $0.sourceId == person.id && $0.type == "employed_by" }
            if let rel = rels.first,
               let employerPos = positionUpdates.first(where: { $0.0 == rel.targetId }) {
                let count = employerPeopleCount[rel.targetId] ?? 0
                employerPeopleCount[rel.targetId] = count + 1

                // Stack people below the company, offset to the right
                let x = employerPos.1 + 120 + CGFloat(count / 3) * 100
                let y = employerPos.2 + 100 + CGFloat(count % 3) * 120

                positionUpdates.append((person.id, x, y))
                placedPeople.insert(person.id)
            }
        }

        // Place unconnected people at the bottom
        let unplacedPeople = people.filter { !placedPeople.contains($0.id) }
        let peopleStartX: CGFloat = 300
        let peopleY = canvasHeight - 300
        for (index, person) in unplacedPeople.enumerated() {
            let x = peopleStartX + CGFloat(index % 12) * cardSpacingX
            let y = peopleY + CGFloat(index / 12) * cardSpacingY
            positionUpdates.append((person.id, x, y))
        }

        // Place projects near their producing companies
        var placedProjects: Set<UUID> = []
        var producerProjectCount: [UUID: Int] = [:]

        for project in projects {
            let rels = relationships.filter { $0.targetId == project.id && $0.type == "produces" }
            if let rel = rels.first,
               let producerPos = positionUpdates.first(where: { $0.0 == rel.sourceId }) {
                let count = producerProjectCount[rel.sourceId] ?? 0
                producerProjectCount[rel.sourceId] = count + 1

                let x = producerPos.1 - 120 - CGFloat(count / 2) * 100
                let y = producerPos.2 + CGFloat(count % 2) * 100

                positionUpdates.append((project.id, x, y))
                placedProjects.insert(project.id)
            }
        }

        // Place unconnected projects at the top
        let unplacedProjects = projects.filter { !placedProjects.contains($0.id) }
        let projectY: CGFloat = 150
        for (index, project) in unplacedProjects.enumerated() {
            let x: CGFloat = 300 + CGFloat(index % 12) * cardSpacingX
            let y = projectY + CGFloat(index / 12) * cardSpacingY
            positionUpdates.append((project.id, x, y))
        }

        // Apply all position updates
        for (id, x, y) in positionUpdates {
            if let index = objects.firstIndex(where: { $0.id == id }) {
                var obj = objects[index]
                obj.mapX = Double(x)
                obj.mapY = Double(y)
                objects[index] = obj
                try? await updateObject(obj)
            }
        }
    }

    // MARK: - Helpers

    private func parseJSON(_ jsonString: String) -> [String: AnyCodable] {
        guard let data = jsonString.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return dict.mapValues { AnyCodable($0) }
    }

    private func serializeJSON(_ dict: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let string = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return string
    }

    private func parseDate(_ cString: UnsafePointer<UInt8>?) -> Date? {
        guard let cString = cString else { return nil }
        let string = String(cString: cString)
        return ISO8601DateFormatter().date(from: string)
    }
}

// MARK: - SQLite Transient Helper
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
