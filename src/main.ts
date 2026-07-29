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
      id: "preview-indent-to-headings-conversion",
      name: "Preview indent to headings conversion",
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Indent to Headings" });

    new Setting(containerEl)
      .setName("Base heading level")
      .setDesc("Heading level used for unindented lines when no nearby heading exists.")
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level += 1) {
          dropdown.addOption(String(level), `H${level}`);
        }

        dropdown
          .setValue(String(this.plugin.settings.baseHeadingLevel))
          .onChange(async (value) => {
            this.plugin.settings.baseHeadingLevel = Number(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Spaces per indent")
      .setDesc("Leading spaces are counted in groups of this size. Tabs always count as one indent.")
      .addDropdown((dropdown) => {
        [2, 3, 4].forEach((size) => dropdown.addOption(String(size), String(size)));
        dropdown
          .setValue(String(this.plugin.settings.spacesPerIndent))
          .onChange(async (value) => {
            this.plugin.settings.spacesPerIndent = Number(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Leaf lines as text")
      .setDesc("Only lines with indented children become headings. Final child lines become body text.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.leafLinesAsText)
          .onChange(async (value) => {
            this.plugin.settings.leafLinesAsText = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Minimum children for heading")
      .setDesc("A plain line needs this many direct child lines before it becomes a heading.")
      .addDropdown((dropdown) => {
        [1, 2, 3].forEach((count) => dropdown.addOption(String(count), String(count)));
        dropdown
          .setValue(String(this.plugin.settings.minimumChildrenForHeading))
          .onChange(async (value) => {
            this.plugin.settings.minimumChildrenForHeading = Number(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Leaf text style")
      .setDesc("How child lines with no children are written.")
      .addDropdown((dropdown) => {
        dropdown.addOption("plain", "Plain text");
        dropdown.addOption("bullet", "Bullets");
        dropdown
          .setValue(this.plugin.settings.leafTextStyle)
          .onChange(async (value) => {
            this.plugin.settings.leafTextStyle = value as "plain" | "bullet";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Preserve leaf list markers")
      .setDesc("Keep existing bullets, numbered markers, and task checkboxes on leaf lines.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.preserveLeafListMarkers)
          .onChange(async (value) => {
            this.plugin.settings.preserveLeafListMarkers = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Strip list markers from headings")
      .setDesc("Remove bullets, numbered-list markers, and task checkboxes before creating headings.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.stripListMarkers)
          .onChange(async (value) => {
            this.plugin.settings.stripListMarkers = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Preserve blank lines")
      .setDesc("Keep blank lines from the original outline.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.preserveBlankLines)
          .onChange(async (value) => {
            this.plugin.settings.preserveBlankLines = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Prefer marked blocks")
      .setDesc(`When ${START_MARKER} and ${END_MARKER} exist, the main command only converts inside them.`)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.preferMarkedBlocks)
          .onChange(async (value) => {
            this.plugin.settings.preferMarkedBlocks = value;
            await this.plugin.saveSettings();
          });
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
