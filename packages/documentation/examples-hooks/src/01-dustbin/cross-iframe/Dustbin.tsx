import React, {
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react'
import {
	DndContext,
	DragObjectWithType,
	DropTargetMonitor,
	useDrop,
} from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'
import { ItemTypes } from './ItemTypes'

export const Dustbin: React.FC = () => {
	const { dragDropManager } = useContext(DndContext)

	const initialized = useRef(false)
	const parentIFrameWindow = useRef<HTMLIFrameElement | null>(null)
	const ceIFrameRef = useRef<HTMLIFrameElement | null>(null)

	const [iframeLoaded, setIframeLoaded] = useState(false)

	const ceAPI = useRef<any | null>(null)

	const handleIframeRef = useCallback((iFrameNode: HTMLIFrameElement): void => {
		parentIFrameWindow.current = iFrameNode
		initialized.current = true
	}, [])

	const [{ droppableHover }, dropRef] = useDrop<
		DragObjectWithType & { name: string },
		unknown,
		{ droppableHover: boolean }
	>({
		accept: [ItemTypes.BOX, NativeTypes.URL],
		canDrop: () => {
			return true
		},
		drop: (item, monitor: DropTargetMonitor) => {
			if (item.type === ItemTypes.BOX) {
				const offset = monitor.getClientOffset()
				if (offset) {
					ceAPI.current.execCommand(
						'caretlocation',
						{ x: offset.x, y: offset.y },
						2,
					)
				}

				const pasteState = {
					matchStyle: false,
					values: [{ type: 'text/plain', value: item.name }],
				}
				ceAPI.current.execCommand('paste', pasteState)
			}
		},
		collect: (monitor) => {
			return {
				droppableHover:
					monitor.canDrop() && monitor.isOver() && Boolean(monitor.getItem()),
			}
		},
	})

	useEffect(() => {
		if (iframeLoaded) {
			const body = ceIFrameRef.current?.contentDocument?.body
			if (body) {
				dropRef(body)
			}
		}
	}, [dropRef, iframeLoaded])

	useEffect(() => {
		return () => {
			if (ceIFrameRef.current?.contentWindow) {
				dragDropManager
					?.getBackend()
					.removeWindow(ceIFrameRef.current.contentWindow)
			}
		}
	}, [])

	return (
		<>
			{droppableHover && (
				<div
					style={{
						position: 'absolute',
						height: '500px',
						width: '500px',
						backgroundColor: 'grey',
						opacity: 0.5,
						pointerEvents: 'none',
					}}
				></div>
			)}
			<iframe
				src={
					'http://evernote.s3.amazonaws.com/ce/demo/latest/index.html?platform=win&client=win'
				}
				style={{
					width: '500px',
					height: '500px',
				}}
				ref={handleIframeRef}
				onLoad={() => {
					const ceIFrame = parentIFrameWindow.current?.contentDocument?.getElementsByTagName(
						'iframe',
					)[0]
					if (!ceIFrame?.contentWindow) {
						return
					}

					ceIFrameRef.current = ceIFrame
					const contentWindow = ceIFrame.contentWindow
					ceAPI.current = ((contentWindow as unknown) as { EN: any }).EN

					dragDropManager?.getBackend().addWindow(ceIFrame.contentWindow)

					addEventListeners(ceIFrame.contentWindow, ceAPI.current)

					setIframeLoaded(true)
				}}
			/>
		</>
	)
}

function setSelectionData(
	clipboardData: any | null,
	dataTarget: DataTransfer | null,
): void {
	if (!clipboardData || !dataTarget) {
		return
	}
	dataTarget.setData('text/html', clipboardData.html)
	dataTarget.setData('text/plain', clipboardData.plain)
	dataTarget.setData('resources', JSON.stringify(clipboardData.resources))
}

let localDrag = false

function addEventListeners(ceWindow: Window, ceAPI: any) {
	function handleDragStart(evt: Event): void {
		localDrag = true

		const e = evt as DragEvent
		if (!e || !e.target || !e.dataTransfer) {
			return
		}

		if (e.dataTransfer.getData('PesoDrag')) {
			const response = ceAPI.queryCommandValueAndParse('copy', {
				resources: true,
			})
			setSelectionData(response, e.dataTransfer)

			if (!response.resourceCopy) {
				return
			}
			if (response.resources.length < 1) {
				return
			}

			const { filename = `${Date.now()}`, mime, url } = response.resources[0]
			if (url) {
				e.dataTransfer.setData('DownloadURL', `${mime}:${filename}:${url}`)
			}
		}
	}

	function handlePasteOrDrop(evt: Event): void {
		// Skip local drag and drop
		if (localDrag) {
			localDrag = false
			return
		}

		if (evt.type === 'drop') {
			const e = evt as DragEvent
			ceAPI.execCommand('caretlocation', { x: e.clientX, y: e.clientY }, 2)
		}
	}

	function handleDragEnd(): void {
		localDrag = false
	}

	ceWindow.addEventListener('dragstart', handleDragStart, true)
	ceWindow.addEventListener('dragend', handleDragEnd, false)
	ceWindow.addEventListener('drop', handlePasteOrDrop, true)
}
