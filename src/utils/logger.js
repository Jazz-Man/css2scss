import chalk from "chalk";

class Logger {
	constructor() {
		this.isVerbose = false;
		this.isQuiet = false;
	}

	setVerbose(value) {
		this.isVerbose = value;
	}

	setQuiet(value) {
		this.isQuiet = value;
	}

	info(message) {
		if (!this.isQuiet) {
			console.log(chalk.blue("ℹ"), message);
		}
	}

	success(message) {
		if (!this.isQuiet) {
			console.log(chalk.green("✓"), message);
		}
	}

	warn(message) {
		console.log(chalk.yellow("⚠"), message);
	}

	error(message) {
		console.log(chalk.red("✗"), message);
	}

	log(message) {
		if (this.isVerbose && !this.isQuiet) {
			console.log(chalk.gray("  →"), message);
		}
	}
}

export const logger = new Logger();
