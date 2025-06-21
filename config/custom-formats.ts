// Note: This is the list of formats
// The rules that formats use are stored in data/rulesets.ts
/*
If you want to add custom formats, create a file in this folder named: "custom-formats.ts"

Paste the following code into the file and add your desired formats and their sections between the brackets:
--------------------------------------------------------------------------------
// Note: This is the list of formats
// The rules that formats use are stored in data/rulesets.ts

export const Formats: FormatList = [
];
--------------------------------------------------------------------------------

If you specify a section that already exists, your format will be added to the bottom of that section.
New sections will be added to the bottom of the specified column.
The column value will be ignored for repeat sections.
*/

export const Formats: import('../sim/dex-formats').FormatList = [

	// S/V Singles
	///////////////////////////////////////////////////////////////////

	{
		section: "Inter-Dimensional",
	},
	{
		name: "[Gen 9] DI",
		mod: 'gen9',
		ruleset: ['Standard NatDex', 'Terastal Clause'],
		banlist: ['AG', 'Uber', 'IBL', 'Arena Trap', 'Moody', 'Shadow Tag', 'King\'s Rock', 'Razor Fang', 'Last Respects', 'Shed Tail'],
	},
	{
		name: "[Gen 9] Ubers",
		mod: 'gen9',
		ruleset: ['Standard NatDex', 'Terastal Clause'],
		banlist: ['AG', 'Moody', 'King\'s Rock', 'Razor Fang', 'Baton Pass', 'Last Respects'],
	},
	{
		name: "[Gen 9] DII",
		mod: 'gen9',
		ruleset: ['[Gen 9] DI'],
		banlist: ['DI', 'IIBL'],
	},
	{
		name: "[Gen 9] DIII",
		mod: 'gen9',
		ruleset: ['[Gen 9] DII'],
		banlist: ['DII', 'IIIBL', 'Light Clay'],
	},
	{
		name: "[Gen 9] DIV",
		mod: 'gen9',
		ruleset: ['[Gen 9] DIII'],
		banlist: ['DIII', 'IVBL', 'Drought', 'Quick Claw'],
	},
	{
		name: "[Gen 9] DV",
		mod: 'gen9',
		ruleset: ['[Gen 9] DIV'],
		banlist: ['DIV', 'VBL', 'Damp Rock'],
	},
];
