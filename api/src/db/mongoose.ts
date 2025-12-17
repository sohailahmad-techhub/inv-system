import mongoose from 'mongoose';

type ConnectOptions = {
  uri: string;
  maxPoolSize: number;
};

let listenersRegistered = false;

export async function connectToDatabase({ uri, maxPoolSize }: ConnectOptions) {
  if (!listenersRegistered) {
    listenersRegistered = true;

    mongoose.connection.on('connected', () => {
      console.log('[db] connected');
    });

    mongoose.connection.on('disconnected', () => {
      console.log('[db] disconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[db] connection error', err);
    });
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    maxPoolSize,
    serverSelectionTimeoutMS: 5000
  });

  return mongoose.connection;
}

export function getDatabaseStatus() {
  const state = mongoose.connection.readyState;
  return {
    state,
    connected: state === 1
  };
}
