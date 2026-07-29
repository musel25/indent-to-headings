import {
  App,
  ButtonComponent,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  END_MARKER,
  IndentToHeadingsSettings,
  START_MARKER,
  convertIndentedOutline,
} from "./converter";

interface TextTarget {
  original: string;
  from?: { line: number; ch: number };
  to?: { line: number; ch: number };
}

type SettingKey = Extract<keyof IndentToHeadingsSettings, string>;

export default class IndentToHeadingsPlugin extends Plugin {
  settings: IndentToHeadingsSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "convert-indented-outline-to-headings",
      name: "Convert indented outline to headings",
      editorCallback: (editor) => this.convertEditorText(editor),
    });

    this.addCommand({
      id: "convert-current-outline-block-to-headings",
      name: "Convert current outline block to headings",
      editorCallback: (editor) => this.convertCurrentBlock(editor),
    });

    this.addCommand({
      id: "convert-marked-outline-blocks-to-headings",
      name: "Convert marked outline blocks to headings",
      editorCallback: (editor) => this.convertMarkedBlocks(editor),
    });

    this.addCommand({
      id: "preview-conversion",
      name: "Preview conversion",
      editorCallback: (editor) => this.previewConversion(editor),
    });

    this.addRibbonIcon("heading", "Convert indented outline to headings", () => {
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

      if (!markdownView) {
        new Notice("Open a Markdown note first.");
        return;
      }

      this.convertEditorText(markdownView.editor);
    });

    this.addSettingTab(new IndentToHeadingsSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const savedSettings: unknown = await this.loadData();
    this.settings = readSettings(savedSettings);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  convertEditorText(editor: Editor): void {
    const target = getSelectionOrFullNote(editor);
    const result = convertIndentedOutline(target.original, this.settings);

    if (!result.changed) {
      new Notice("Nothing changed.");
      return;
    }

    replaceTarget(editor, target, result.text);
    new Notice(target.from ? "Converted selection to headings." : "Converted note to headings.");
  }

  convertCurrentBlock(editor: Editor): void {
    const target = editor.somethingSelected() ? getSelectionOrFullNote(editor) : getCurrentBlock(editor);
    const result = convertIndentedOutline(target.original, this.settings);

    if (!result.changed) {
      new Notice("Nothing changed.");
      return;
    }

    replaceTarget(editor, target, result.text);
    new Notice("Converted current outline block to headings.");
  }

  convertMarkedBlocks(editor: Editor): void {
    const target = getSelectionOrFullNote(editor);
    const result = convertIndentedOutline(target.original, this.settings, { onlyMarkedBlocks: true });

    if (result.markedBlocksFound === 0) {
      new Notice("No marked outline blocks found.");
      return;
    }

    if (!result.changed) {
      new Notice("Marked blocks are already converted.");
      return;
    }

    replaceTarget(editor, target, result.text);
    new Notice(`Converted ${result.markedBlocksFound} marked block${result.markedBlocksFound === 1 ? "" : "s"}.`);
  }

  previewConversion(editor: Editor): void {
    const target = getSelectionOrFullNote(editor);
    const result = convertIndentedOutline(target.original, this.settings);

    if (!result.changed) {
      new Notice("Nothing changed.");
      return;
    }

    new ConversionPreviewModal(this.app, target.original, result.text, () => {
      replaceTarget(editor, target, result.text);
      new Notice("Applied indent to headings conversion.");
    }).open();
  }
}

class ConversionPreviewModal extends Modal {
  constructor(
    app: App,
    private readonly beforeText: string,
    private readonly afterText: string,
    private readonly onApply: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Preview conversion" });

    const wrapper = contentEl.createDiv({ cls: "indent-to-headings-preview" });
    wrapper.createEl("label", { text: "Before" });
    const before = wrapper.createEl("textarea");
    before.value = this.beforeText;
    before.readOnly = true;

    wrapper.createEl("label", { text: "After" });
    const after = wrapper.createEl("textarea");
    after.value = this.afterText;
    after.readOnly = true;

    const actions = wrapper.createDiv({ cls: "indent-to-headings-preview-actions" });
    new ButtonComponent(actions)
      .setButtonText("Cancel")
      .onClick(() => this.close());
    new ButtonComponent(actions)
      .setButtonText("Apply")
      .setCta()
      .onClick(() => {
        this.onApply();
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class IndentToHeadingsSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: IndentToHeadingsPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
    return [
      {
        type: "group",
        heading: "Indent to Headings",
        items: [
          {
            name: "Base heading level",
            desc: "Heading level used for unindented lines when no nearby heading exists.",
            control: {
              key: "baseHeadingLevel",
              type: "dropdown",
              defaultValue: String(DEFAULT_SETTINGS.baseHeadingLevel),
              options: headingLevelOptions(),
            },
          },
          {
            name: "Spaces per indent",
            desc: "Leading spaces are counted in groups of this size. Tabs always count as one indent.",
            control: {
              key: "spacesPerIndent",
              type: "dropdown",
              defaultValue: String(DEFAULT_SETTINGS.spacesPerIndent),
              options: numberOptions([2, 3, 4]),
            },
          },
          {
            name: "Leaf lines as text",
            desc: "Only lines with indented children become headings. Final child lines become body text.",
            control: {
              key: "leafLinesAsText",
              type: "toggle",
              defaultValue: DEFAULT_SETTINGS.leafLinesAsText,
            },
          },
          {
            name: "Minimum children for heading",
            desc: "A plain line needs this many direct child lines before it becomes a heading.",
            control: {
              key: "minimumChildrenForHeading",
              type: "dropdown",
              defaultValue: String(DEFAULT_SETTINGS.minimumChildrenForHeading),
              options: numberOptions([1, 2, 3]),
            },
          },
          {
            name: "Leaf text style",
            desc: "How child lines with no children are written.",
            control: {
              key: "leafTextStyle",
              type: "dropdown",
              defaultValue: DEFAULT_SETTINGS.leafTextStyle,
              options: {
                plain: "Plain text",
                bullet: "Bullets",
              },
            },
          },
          {
            name: "Preserve leaf list markers",
            desc: "Keep existing bullets, numbered markers, and task checkboxes on leaf lines.",
            control: {
              key: "preserveLeafListMarkers",
              type: "toggle",
              defaultValue: DEFAULT_SETTINGS.preserveLeafListMarkers,
            },
          },
          {
            name: "Strip list markers from headings",
            desc: "Remove bullets, numbered-list markers, and task checkboxes before creating headings.",
            control: {
              key: "stripListMarkers",
              type: "toggle",
              defaultValue: DEFAULT_SETTINGS.stripListMarkers,
            },
          },
          {
            name: "Preserve blank lines",
            desc: "Keep blank lines from the original outline.",
            control: {
              key: "preserveBlankLines",
              type: "toggle",
              defaultValue: DEFAULT_SETTINGS.preserveBlankLines,
            },
          },
          {
            name: "Prefer marked blocks",
            desc: `When ${START_MARKER} and ${END_MARKER} exist, the main command only converts inside them.`,
            control: {
              key: "preferMarkedBlocks",
              type: "toggle",
              defaultValue: DEFAULT_SETTINGS.preferMarkedBlocks,
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: SettingKey): unknown {
    switch (key) {
      case "baseHeadingLevel":
      case "spacesPerIndent":
      case "minimumChildrenForHeading":
        return String(this.plugin.settings[key]);
      default:
        return this.plugin.settings[key];
    }
  }

  setControlValue(key: SettingKey, value: unknown): void {
    applySettingValue(this.plugin.settings, key, value);
    void this.plugin.saveSettings();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Indent to Headings")
      .setHeading();

    this.addDropdownSetting(
      "Base heading level",
      "Heading level used for unindented lines when no nearby heading exists.",
      "baseHeadingLevel",
      headingLevelOptions()
    );
    this.addDropdownSetting(
      "Spaces per indent",
      "Leading spaces are counted in groups of this size. Tabs always count as one indent.",
      "spacesPerIndent",
      numberOptions([2, 3, 4])
    );
    this.addToggleSetting(
      "Leaf lines as text",
      "Only lines with indented children become headings. Final child lines become body text.",
      "leafLinesAsText"
    );
    this.addDropdownSetting(
      "Minimum children for heading",
      "A plain line needs this many direct child lines before it becomes a heading.",
      "minimumChildrenForHeading",
      numberOptions([1, 2, 3])
    );
    this.addDropdownSetting(
      "Leaf text style",
      "How child lines with no children are written.",
      "leafTextStyle",
      { plain: "Plain text", bullet: "Bullets" }
    );
    this.addToggleSetting(
      "Preserve leaf list markers",
      "Keep existing bullets, numbered markers, and task checkboxes on leaf lines.",
      "preserveLeafListMarkers"
    );
    this.addToggleSetting(
      "Strip list markers from headings",
      "Remove bullets, numbered-list markers, and task checkboxes before creating headings.",
      "stripListMarkers"
    );
    this.addToggleSetting("Preserve blank lines", "Keep blank lines from the original outline.", "preserveBlankLines");
    this.addToggleSetting(
      "Prefer marked blocks",
      `When ${START_MARKER} and ${END_MARKER} exist, the main command only converts inside them.`,
      "preferMarkedBlocks"
    );
  }

  private addDropdownSetting(
    name: string,
    desc: string,
    key: SettingKey,
    options: Record<string, string>
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addDropdown((dropdown) => {
        Object.entries(options).forEach(([value, label]) => dropdown.addOption(value, label));
        dropdown
          .setValue(String(this.getControlValue(key)))
          .onChange((value) => this.setControlValue(key, value));
      });
  }

  private addToggleSetting(name: string, desc: string, key: SettingKey): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) => {
        toggle
          .setValue(Boolean(this.getControlValue(key)))
          .onChange((value) => this.setControlValue(key, value));
      });
  }
}

function getSelectionOrFullNote(editor: Editor): TextTarget {
  if (editor.somethingSelected()) {
    return {
      original: editor.getSelection(),
      from: editor.getCursor("from"),
      to: editor.getCursor("to"),
    };
  }

  return { original: editor.getValue() };
}

function readSettings(value: unknown): IndentToHeadingsSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    baseHeadingLevel: readNumber(value.baseHeadingLevel, DEFAULT_SETTINGS.baseHeadingLevel, [1, 2, 3, 4, 5, 6]),
    spacesPerIndent: readNumber(value.spacesPerIndent, DEFAULT_SETTINGS.spacesPerIndent, [2, 3, 4]),
    leafLinesAsText: readBoolean(value.leafLinesAsText, DEFAULT_SETTINGS.leafLinesAsText),
    minimumChildrenForHeading: readNumber(
      value.minimumChildrenForHeading,
      DEFAULT_SETTINGS.minimumChildrenForHeading,
      [1, 2, 3]
    ),
    stripListMarkers: readBoolean(value.stripListMarkers, DEFAULT_SETTINGS.stripListMarkers),
    preserveLeafListMarkers: readBoolean(value.preserveLeafListMarkers, DEFAULT_SETTINGS.preserveLeafListMarkers),
    leafTextStyle: value.leafTextStyle === "bullet" ? "bullet" : DEFAULT_SETTINGS.leafTextStyle,
    preserveBlankLines: readBoolean(value.preserveBlankLines, DEFAULT_SETTINGS.preserveBlankLines),
    preferMarkedBlocks: readBoolean(value.preferMarkedBlocks, DEFAULT_SETTINGS.preferMarkedBlocks),
  };
}

function applySettingValue(settings: IndentToHeadingsSettings, key: SettingKey, value: unknown): void {
  switch (key) {
    case "baseHeadingLevel":
      settings.baseHeadingLevel = readNumber(value, settings.baseHeadingLevel, [1, 2, 3, 4, 5, 6]);
      return;
    case "spacesPerIndent":
      settings.spacesPerIndent = readNumber(value, settings.spacesPerIndent, [2, 3, 4]);
      return;
    case "minimumChildrenForHeading":
      settings.minimumChildrenForHeading = readNumber(value, settings.minimumChildrenForHeading, [1, 2, 3]);
      return;
    case "leafLinesAsText":
      settings.leafLinesAsText = readBoolean(value, settings.leafLinesAsText);
      return;
    case "stripListMarkers":
      settings.stripListMarkers = readBoolean(value, settings.stripListMarkers);
      return;
    case "preserveLeafListMarkers":
      settings.preserveLeafListMarkers = readBoolean(value, settings.preserveLeafListMarkers);
      return;
    case "leafTextStyle":
      settings.leafTextStyle = value === "bullet" ? "bullet" : "plain";
      return;
    case "preserveBlankLines":
      settings.preserveBlankLines = readBoolean(value, settings.preserveBlankLines);
      return;
    case "preferMarkedBlocks":
      settings.preferMarkedBlocks = readBoolean(value, settings.preferMarkedBlocks);
      return;
  }
}

function headingLevelOptions(): Record<string, string> {
  return {
    "1": "H1",
    "2": "H2",
    "3": "H3",
    "4": "H4",
    "5": "H5",
    "6": "H6",
  };
}

function numberOptions(values: number[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => [String(value), String(value)]));
}

function readNumber(value: unknown, fallback: number, allowed: number[]): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return allowed.includes(parsed) ? parsed : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getCurrentBlock(editor: Editor): TextTarget {
  const cursor = editor.getCursor();
  let startLine = cursor.line;
  let endLine = cursor.line;

  while (startLine > 0 && editor.getLine(startLine - 1).trim() !== "") {
    startLine -= 1;
  }

  while (endLine < editor.lineCount() - 1 && editor.getLine(endLine + 1).trim() !== "") {
    endLine += 1;
  }

  const lines: string[] = [];
  for (let line = startLine; line <= endLine; line += 1) {
    lines.push(editor.getLine(line));
  }

  return {
    original: lines.join("\n"),
    from: { line: startLine, ch: 0 },
    to: { line: endLine, ch: editor.getLine(endLine).length },
  };
}

function replaceTarget(editor: Editor, target: TextTarget, replacement: string): void {
  if (target.from && target.to) {
    editor.replaceRange(replacement, target.from, target.to);
    return;
  }

  editor.setValue(replacement);
}
