

# .env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/dbname
NODE_ENV=development
JWT_SECRET=your



# to create client and serve
## client
mkdir client
cd client
npx create-react-app .
npm install socket.io-client axios

## server
mkdir server
cd server
npm init -y
npm install express mongoose socket.io cors dotenv




# If you want to use nodemon for development (auto-restart on file changes):
npm install nodemon --save-dev
npm run dev


# To run the project
Make sure your MongoDB server is running
net start mongodb
## Terminal 1 (Server)
cd server
npm start

## Terminal 2 (Client)
cd client
npm start


## to get JWTsecretKey
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

1. Navigate to server directory:
```bash
cd server
```

2. Install required packages:
```bash
npm install cloudinary multer multer-storage-cloudinary dotenv
```

3. Create a Cloudinary account:
- Sign up at [Cloudinary](https://cloudinary.com/)
- Go to your Dashboard
- Copy your Cloud Name, API Key, and API Secret
