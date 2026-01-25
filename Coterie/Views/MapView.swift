import SwiftUI
import AppKit

struct MapView: View {
    @StateObject private var database = LocalDatabase.shared

    // Canvas state
    @State private var canvasOffset: CGPoint = .zero
    @State private var canvasScale: CGFloat = 1.0
    @State private var lastDragOffset: CGPoint = .zero
    @State private var lastScale: CGFloat = 1.0
    @State private var draggedObject: GraphObject?
    @State private var dragOffset: CGSize = .zero

    // Selection
    @State private var selectedObject: GraphObject?

    private let cardSize = CGSize(width: 180, height: 80)
    private let canvasSize = CGSize(width: 4000, height: 3000)

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background grid
                CanvasGridBackground()
                    .scaleEffect(canvasScale)
                    .offset(x: canvasOffset.x, y: canvasOffset.y)

                // Main canvas content
                ZStack {
                    // Connection lines (drawn first, behind cards)
                    ForEach(database.relationships, id: \.id) { rel in
                        if let line = lineForRelationship(rel) {
                            ConnectionLine(
                                from: line.from,
                                to: line.to,
                                relationshipType: rel.type
                            )
                        }
                    }

                    // Object cards
                    ForEach(database.objects) { object in
                        let isDragging = draggedObject?.id == object.id
                        ObjectMapCard(
                            object: object,
                            objectClass: database.objectClasses.first { $0.id == object.objectClass },
                            objectTypes: database.typesForObject(object.id),
                            isSelected: selectedObject?.id == object.id
                        )
                        .position(isDragging ? dragPosition(for: object) : positionForObject(object))
                        .gesture(
                            DragGesture()
                                .onChanged { value in
                                    if draggedObject == nil {
                                        draggedObject = object
                                    }
                                    dragOffset = CGSize(
                                        width: value.translation.width / canvasScale,
                                        height: value.translation.height / canvasScale
                                    )
                                }
                                .onEnded { _ in
                                    // Calculate final position
                                    let newPosition = dragPosition(for: object)

                                    // Update local state immediately to prevent flash
                                    var updatedObject = object
                                    updatedObject.mapX = Double(newPosition.x)
                                    updatedObject.mapY = Double(newPosition.y)

                                    // Update local array first
                                    if let index = database.objects.firstIndex(where: { $0.id == object.id }) {
                                        database.objects[index] = updatedObject
                                    }

                                    // Clear drag state
                                    draggedObject = nil
                                    dragOffset = .zero

                                    // Then persist to database
                                    Task {
                                        try? await database.updateObject(updatedObject)
                                    }
                                }
                        )
                        .onTapGesture {
                            selectedObject = object
                        }
                    }
                }
                .frame(width: canvasSize.width, height: canvasSize.height)
                .scaleEffect(canvasScale)
                .offset(x: canvasOffset.x, y: canvasOffset.y)
            }
            .clipped()
            .overlay(alignment: .bottomLeading) {
                MapColorKey(objectClasses: database.objectClasses)
                    .padding()
            }
            .overlay(alignment: .center) {
                if database.isLoading {
                    ProgressView("Loading...")
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(8)
                }
            }
            .background(Color(nsColor: .windowBackgroundColor))
            .contentShape(Rectangle()) // Makes the entire area respond to gestures
            .gesture(
                // Pan gesture (two-finger drag on trackpad, or click-drag on background)
                DragGesture()
                    .onChanged { value in
                        if draggedObject == nil {
                            // Only pan canvas if not dragging an object
                            canvasOffset = CGPoint(
                                x: lastDragOffset.x + value.translation.width,
                                y: lastDragOffset.y + value.translation.height
                            )
                        }
                    }
                    .onEnded { _ in
                        lastDragOffset = canvasOffset
                    }
            )
            .simultaneousGesture(
                // Zoom gesture (pinch)
                MagnificationGesture()
                    .onChanged { value in
                        let newScale = lastScale * value
                        canvasScale = max(0.25, min(2.0, newScale))
                    }
                    .onEnded { _ in
                        lastScale = canvasScale
                    }
            )
            .simultaneousGesture(
                // Tap to deselect
                TapGesture()
                    .onEnded {
                        selectedObject = nil
                    }
            )
            .background(
                ScrollWheelHandler { deltaX, deltaY in
                    // Also support mouse scroll wheel
                    canvasOffset = CGPoint(
                        x: canvasOffset.x + deltaX * 2,
                        y: canvasOffset.y + deltaY * 2
                    )
                    lastDragOffset = canvasOffset
                }
            )
            .onAppear {
                initializePositions(in: geometry.size)
                Task {
                    await database.fetchAll()
                }
            }
        }
        .navigationTitle("Map")
        .toolbar {
            ToolbarItemGroup {
                Button(action: autoArrange) {
                    Image(systemName: "rectangle.3.group")
                }
                .help("Auto-arrange cards")

                Button(action: refresh) {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh")

                Button(action: zoomIn) {
                    Image(systemName: "plus.magnifyingglass")
                }
                Button(action: zoomOut) {
                    Image(systemName: "minus.magnifyingglass")
                }
                Button(action: resetView) {
                    Image(systemName: "arrow.counterclockwise")
                }
                .help("Reset view")
            }
        }
    }

    // MARK: - Helpers

    private func positionForObject(_ object: GraphObject) -> CGPoint {
        if let x = object.mapX, let y = object.mapY {
            return CGPoint(x: x, y: y)
        }
        return defaultPosition(for: object)
    }

    private func dragPosition(for object: GraphObject) -> CGPoint {
        let base = positionForObject(object)
        return CGPoint(
            x: base.x + dragOffset.width,
            y: base.y + dragOffset.height
        )
    }

    private func defaultPosition(for object: GraphObject) -> CGPoint {
        // Generate a consistent position based on the object's index
        guard let index = database.objects.firstIndex(where: { $0.id == object.id }) else {
            return CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
        }

        let columns = max(1, Int(sqrt(Double(database.objects.count))))
        let spacing: CGFloat = 250

        let row = index / columns
        let col = index % columns

        let x = canvasSize.width / 2 + CGFloat(col - columns / 2) * spacing
        let y = canvasSize.height / 2 + CGFloat(row) * spacing - CGFloat(database.objects.count / columns) * spacing / 2

        return CGPoint(x: x, y: y)
    }

    private func lineForRelationship(_ relationship: GraphRelationship) -> (from: CGPoint, to: CGPoint)? {
        guard let sourceObject = database.objects.first(where: { $0.id == relationship.sourceId }),
              let targetObject = database.objects.first(where: { $0.id == relationship.targetId }) else {
            return nil
        }

        let sourceCenter = draggedObject?.id == sourceObject.id ? dragPosition(for: sourceObject) : positionForObject(sourceObject)
        let targetCenter = draggedObject?.id == targetObject.id ? dragPosition(for: targetObject) : positionForObject(targetObject)

        // Get nodule positions for each object
        let sourceNodules = nodulePositions(for: sourceObject, at: sourceCenter)
        let targetNodules = nodulePositions(for: targetObject, at: targetCenter)

        // Find the closest pair of nodules
        let from = closestNodule(from: sourceNodules, to: targetCenter)
        let to = closestNodule(from: targetNodules, to: sourceCenter)

        return (from, to)
    }

    private func nodulePositions(for object: GraphObject, at center: CGPoint) -> [CGPoint] {
        let size = cardSize(for: object.objectClass)
        let halfW = size.width / 2
        let halfH = size.height / 2

        return [
            CGPoint(x: center.x, y: center.y - halfH),      // Top
            CGPoint(x: center.x + halfW, y: center.y),      // Right
            CGPoint(x: center.x, y: center.y + halfH),      // Bottom
            CGPoint(x: center.x - halfW, y: center.y)       // Left
        ]
    }

    private func cardSize(for objectClass: String) -> CGSize {
        switch objectClass {
        case "person": return CGSize(width: 180, height: 70)
        case "project": return CGSize(width: 180, height: 90)
        default: return CGSize(width: 180, height: 80)
        }
    }

    private func closestNodule(from nodules: [CGPoint], to target: CGPoint) -> CGPoint {
        nodules.min(by: { distance($0, target) < distance($1, target) }) ?? nodules[0]
    }

    private func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
        sqrt(pow(a.x - b.x, 2) + pow(a.y - b.y, 2))
    }

    private func initializePositions(in size: CGSize) {
        // Center the view
        canvasOffset = CGPoint(
            x: size.width / 2 - canvasSize.width / 2,
            y: size.height / 2 - canvasSize.height / 2
        )
        lastDragOffset = canvasOffset
    }

    private func refresh() {
        Task {
            await database.fetchAll()
        }
    }

    private func autoArrange() {
        Task {
            await database.autoLayoutObjects()
            await database.fetchAll()
        }
    }

    private func zoomIn() {
        withAnimation(.easeInOut(duration: 0.2)) {
            canvasScale = min(2.0, canvasScale * 1.25)
            lastScale = canvasScale
        }
    }

    private func zoomOut() {
        withAnimation(.easeInOut(duration: 0.2)) {
            canvasScale = max(0.25, canvasScale / 1.25)
            lastScale = canvasScale
        }
    }

    private func resetView() {
        withAnimation(.easeInOut(duration: 0.3)) {
            canvasScale = 1.0
            lastScale = 1.0
            canvasOffset = .zero
            lastDragOffset = .zero
        }
    }
}

// MARK: - Object Card

struct ObjectMapCard: View {
    let object: GraphObject
    let objectClass: ObjectClass?
    let objectTypes: [ObjectType]
    let isSelected: Bool

    private var cardWidth: CGFloat {
        switch object.objectClass {
        case "project": return 180  // Octagon shape
        default: return 180
        }
    }

    private var cardHeight: CGFloat {
        switch object.objectClass {
        case "person": return 70    // Ovals need defined height
        case "project": return 90   // Octagon shape
        default: return 80
        }
    }

    private let noduleSize: CGFloat = 8

    var body: some View {
        cardContent
            .frame(width: cardWidth, height: cardHeight)
            .background(shapeView.fill(backgroundColorForClass(objectClass)))
            .overlay(isSelected ? AnyView(shapeView.stroke(Color.accentColor, lineWidth: 2)) : AnyView(EmptyView()))
            .overlay(nodules)
            .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
    }

    private var nodules: some View {
        ZStack {
            // Top nodule
            Circle()
                .fill(Color.white)
                .frame(width: noduleSize, height: noduleSize)
                .overlay(Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 1))
                .position(x: cardWidth / 2, y: 0)

            // Right nodule
            Circle()
                .fill(Color.white)
                .frame(width: noduleSize, height: noduleSize)
                .overlay(Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 1))
                .position(x: cardWidth, y: cardHeight / 2)

            // Bottom nodule
            Circle()
                .fill(Color.white)
                .frame(width: noduleSize, height: noduleSize)
                .overlay(Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 1))
                .position(x: cardWidth / 2, y: cardHeight)

            // Left nodule
            Circle()
                .fill(Color.white)
                .frame(width: noduleSize, height: noduleSize)
                .overlay(Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 1))
                .position(x: 0, y: cardHeight / 2)
        }
    }

    private var cardContent: some View {
        VStack(spacing: 2) {
            Text(object.name)
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            if !objectTypes.isEmpty {
                Text(objectTypes.map { $0.displayName }.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Text(objectClass?.displayName ?? object.objectClass)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var shapeView: some InsettableShape {
        switch object.objectClass {
        case "person":
            return AnyInsettableShape(Capsule())
        case "project":
            return AnyInsettableShape(DiamondShape())
        default:
            return AnyInsettableShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func backgroundColorForClass(_ objectClass: ObjectClass?) -> Color {
        if let hexColor = objectClass?.color {
            return Color(hex: hexColor).opacity(0.2)
        }

        switch object.objectClass {
        case "company":
            return Color.blue.opacity(0.2)
        case "person":
            return Color.green.opacity(0.2)
        case "project":
            return Color.orange.opacity(0.2)
        default:
            return Color.gray.opacity(0.2)
        }
    }
}

// MARK: - Diamond Shape (Squashed Octagon)

struct DiamondShape: InsettableShape, Sendable {
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: insetAmount, dy: insetAmount)
        var path = Path()

        // Squashed octagon: flat edges at top/bottom/sides, angled corners
        let flatH: CGFloat = r.width * 0.5   // Horizontal flat edge (top/bottom)
        let flatV: CGFloat = r.height * 0.3  // Vertical flat edge (sides)
        let cornerX = (r.width - flatH) / 2
        let cornerY = (r.height - flatV) / 2

        // Start at top-left of top flat edge, go clockwise
        path.move(to: CGPoint(x: r.minX + cornerX, y: r.minY))
        path.addLine(to: CGPoint(x: r.maxX - cornerX, y: r.minY))           // Top flat
        path.addLine(to: CGPoint(x: r.maxX, y: r.minY + cornerY))           // Top-right corner
        path.addLine(to: CGPoint(x: r.maxX, y: r.maxY - cornerY))           // Right flat
        path.addLine(to: CGPoint(x: r.maxX - cornerX, y: r.maxY))           // Bottom-right corner
        path.addLine(to: CGPoint(x: r.minX + cornerX, y: r.maxY))           // Bottom flat
        path.addLine(to: CGPoint(x: r.minX, y: r.maxY - cornerY))           // Bottom-left corner
        path.addLine(to: CGPoint(x: r.minX, y: r.minY + cornerY))           // Left flat
        path.closeSubpath()                                                  // Top-left corner

        return path
    }

    func inset(by amount: CGFloat) -> some InsettableShape {
        var shape = self
        shape.insetAmount += amount
        return shape
    }
}

// MARK: - Type-Erased InsettableShape

struct AnyInsettableShape: InsettableShape, @unchecked Sendable {
    private let _path: @Sendable (CGRect) -> Path
    private let _inset: @Sendable (CGFloat) -> AnyInsettableShape

    init<S: InsettableShape>(_ shape: S) where S: Sendable {
        _path = { shape.path(in: $0) }
        _inset = { AnyInsettableShape(shape.inset(by: $0)) }
    }

    func path(in rect: CGRect) -> Path {
        _path(rect)
    }

    func inset(by amount: CGFloat) -> some InsettableShape {
        _inset(amount)
    }
}

// MARK: - Connection Line

struct ConnectionLine: View {
    let from: CGPoint
    let to: CGPoint
    let relationshipType: String

    var body: some View {
        Path { path in
            path.move(to: from)

            // Curved line using control points
            let midX = (from.x + to.x) / 2
            let controlPoint1 = CGPoint(x: midX, y: from.y)
            let controlPoint2 = CGPoint(x: midX, y: to.y)

            path.addCurve(to: to, control1: controlPoint1, control2: controlPoint2)
        }
        .stroke(Color.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 2, lineCap: .round))
    }
}

// MARK: - Color Key

struct MapColorKey: View {
    let objectClasses: [ObjectClass]
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: { withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() } }) {
                HStack(spacing: 4) {
                    Image(systemName: "paintpalette")
                    if !isExpanded {
                        Text("Key")
                            .font(.caption)
                    }
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.up")
                        .font(.caption2)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(objectClasses) { objClass in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(colorForClass(objClass))
                                .frame(width: 16, height: 16)
                            Text(objClass.displayName)
                                .font(.caption)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 10)
            }
        }
        .background(.regularMaterial)
        .cornerRadius(8)
        .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
    }

    private func colorForClass(_ objClass: ObjectClass) -> Color {
        if let hexColor = objClass.color {
            return Color(hex: hexColor).opacity(0.5)
        }
        return Color.gray.opacity(0.5)
    }
}

// MARK: - Canvas Grid Background

struct CanvasGridBackground: View {
    let gridSpacing: CGFloat = 50

    var body: some View {
        Canvas { context, size in
            let rows = Int(size.height / gridSpacing)
            let cols = Int(size.width / gridSpacing)

            for row in 0...rows {
                let y = CGFloat(row) * gridSpacing
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(path, with: .color(.secondary.opacity(0.1)), lineWidth: 1)
            }

            for col in 0...cols {
                let x = CGFloat(col) * gridSpacing
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(path, with: .color(.secondary.opacity(0.1)), lineWidth: 1)
            }
        }
        .frame(width: 4000, height: 3000)
    }
}

// MARK: - Scroll Wheel Handler

struct ScrollWheelHandler: NSViewRepresentable {
    let onScroll: (CGFloat, CGFloat) -> Void

    func makeNSView(context: Context) -> ScrollWheelNSView {
        let view = ScrollWheelNSView()
        view.onScroll = onScroll
        return view
    }

    func updateNSView(_ nsView: ScrollWheelNSView, context: Context) {
        nsView.onScroll = onScroll
    }
}

class ScrollWheelNSView: NSView {
    var onScroll: ((CGFloat, CGFloat) -> Void)?
    private var monitor: Any?

    override var acceptsFirstResponder: Bool { true }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        setupScrollMonitor()
    }

    private func setupScrollMonitor() {
        // Remove old monitor if exists
        if let monitor = monitor {
            NSEvent.removeMonitor(monitor)
        }

        // Add local monitor for scroll wheel events
        monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
            guard let self = self,
                  let window = self.window,
                  event.window == window else {
                return event
            }

            // Check if mouse is within our window
            let locationInWindow = event.locationInWindow
            if window.contentView?.frame.contains(locationInWindow) == true {
                if event.hasPreciseScrollingDeltas {
                    self.onScroll?(event.scrollingDeltaX, event.scrollingDeltaY)
                } else {
                    self.onScroll?(event.scrollingDeltaX * 10, event.scrollingDeltaY * 10)
                }
            }
            return event
        }
    }

    override func removeFromSuperview() {
        if let monitor = monitor {
            NSEvent.removeMonitor(monitor)
        }
        super.removeFromSuperview()
    }

    deinit {
        if let monitor = monitor {
            NSEvent.removeMonitor(monitor)
        }
    }
}

// MARK: - Color Extension for Hex

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

#Preview {
    MapView()
}
