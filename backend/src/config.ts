
import 'dotenv/config';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
        'JWT_SECRET debe estar definido y tener al menos 32 caracteres.'
    );
}

export const config = {
    jwtSecret,
    jwtExpiresIn: '1h',
};
