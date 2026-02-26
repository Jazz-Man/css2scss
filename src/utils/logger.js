import chalk from "chalk";

/**
 * Creates a logger instance.
 *
 * @returns {Logger} A logger instance.
 */
class Logger {
	constructor() {
		this.isVerbose = false;
		this.isQuiet = false;
	}

	/**
	 * Sets the verbose mode.
	 *
	 * @param {boolean} value - The value to set.
	 */
	setVerbose(value) {
		this.isVerbose = value;
	}

	/**
	 * Sets the quiet mode.
	 *
	 * @param {boolean} value - The value to set.
	 */
	setQuiet(value) {
		this.isQuiet = value;
	}

	/**
	 * Logs an informational message.
	 *
	 * @param {string} message - The message to log.
	 */
	info(message) {
		if (!this.isQuiet) {
			console.log(chalk.blue("ℹ"), message);
		}
	}

	/**
	 * Logs a success message.
	 *
	 * @param {string} message - The message to log.
	 */
	success(message) {
		if (!this.isQuiet) {
			console.log(chalk.green("✓"), message);
		}
	}

	/**
	 * Logs a warning message.
	 *
	 * @param {string} message - The message to log.
	 */
	warn(message) {
		console.log(chalk.yellow("⚠"), message);
	}

	/**
	 * Logs an error message.
	 *
	 * @param {string} message - The message to log.
	 */
	error(message) {
		console.log(chalk.red("✗"), message);
	}

	/**
	 * Logs a message.
	 *
	 * @param {string} message - The message to log.
	 */
	log(message) {
		if (this.isVerbose && !this.isQuiet) {
			console.log(chalk.gray("  →"), message);
		}
	}
}

/**
 * Creates a logger instance.
 *
 * @returns {Logger} A logger instance.
 */
export const logger = new Logger();
