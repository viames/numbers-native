-- Copyright (c) 2026 Viames Marino. MIT License.
-- Fixed helper: all document/range references arrive as argv data, never source code.
-- JXA does not decode the text/number type descriptors in Numbers' format property.
on run argv
  set documentID to item 1 of argv
  set sheetReference to item 3 of argv
  set tableReference to item 5 of argv
  if item 2 of argv is "index" then set sheetReference to sheetReference as integer
  if item 4 of argv is "index" then set tableReference to tableReference as integer
  set rangeReference to item 6 of argv
  tell application id "com.apple.iWork.Numbers"
    set theFormats to format of every cell of range rangeReference of table tableReference of sheet sheetReference of document id documentID
    set labels to {}
    repeat with f in theFormats
      if contents of f is text then
        set end of labels to "text"
      else if contents of f is number then
        set end of labels to "number"
      else if contents of f is automatic then
        set end of labels to "automatic"
      else if contents of f is currency then
        set end of labels to "currency"
      else if contents of f is percent then
        set end of labels to "percent"
      else if contents of f is date and time then
        set end of labels to "date and time"
      else if contents of f is duration then
        set end of labels to "duration"
      else if contents of f is fraction then
        set end of labels to "fraction"
      else if contents of f is scientific then
        set end of labels to "scientific"
      else if contents of f is checkbox then
        set end of labels to "checkbox"
      else if contents of f is rating then
        set end of labels to "rating"
      else if contents of f is slider then
        set end of labels to "slider"
      else if contents of f is stepper then
        set end of labels to "stepper"
      else if contents of f is pop up menu then
        set end of labels to "pop up menu"
      else
        set end of labels to "other"
      end if
    end repeat
  end tell
  set AppleScript's text item delimiters to tab
  return labels as text
end run
