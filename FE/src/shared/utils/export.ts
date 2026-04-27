const ensureIfcFilename = (filename: string): string =>
  filename.toLowerCase().endsWith('.ifc') ? filename : `${filename}.ifc`

export const downloadDataUrl = (dataUrl: string, filename: string): void => {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export const downloadIfcFile = (data: Blob | string, filename: string): void => {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' })
  const objectUrl = URL.createObjectURL(blob)

  try {
    downloadDataUrl(objectUrl, ensureIfcFilename(filename))
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const exportIfc = (ifcContent: string, filename: string): void => {
  downloadIfcFile(ifcContent, filename)
}
