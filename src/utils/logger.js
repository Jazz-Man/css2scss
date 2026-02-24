import chalk from "chalk";

// Bun має вбудовані кольори, але chalk працює краще для крос-платформності
class Logger {
	constructor() {
		this.verbose = false;
		this.quiet = false;
	}

	setVerbose(value) {
		this.verbose = value;
	}

	setQuiet(value) {
		this.quiet = value;
	}

	info(message) {
		if (!this.quiet) {
			console.log(chalk.blue("ℹ"), message);
		}
	}

	success(message) {
		if (!this.quiet) {
			console.log(chalk.green("✓"), message);
		}
	}

	warn(message) {
		console.log(chalk.yellow("⚠"), message);
	}

	error(message) {
		console.log(chalk.red("✗"), message);
	}

	verbose(message) {
		if (this.verbose && !this.quiet) {
			console.log(chalk.gray("  →"), message);
		}
	}
}

export const logger = new Logger();
