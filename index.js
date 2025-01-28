require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_SK);
// require dotenv 
// import 'dotenv/config'
const port = process.env.PORT || 5000;


const app = express();

// middle ware 
app.use(express.json());
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://traventuree.netlify.app',
        'http://localhost:4173'
    ],
    credentials: true,
}));
// cookie parser use 
app.use(cookieParser());
app.use(morgan('dev'));





// mongo db connection 
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.4ayta.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        console.log("successfully connected to MongoDB!");

        // database 
        const database = client.db('Traventure');

        // tour packages collection 
        const tourPackagesCollection = database.collection('tourpackages')

        // request for role collection 
        const TourGuideRequestCollection = database.collection("tourguiderequest")

        // bookings tour collection 
        const bookingTourCollection = database.collection("bookingtour")

        // menu collection 
        const menuCollection = database.collection('menu');

        // reviews collection 
        const reviewsCollection = database.collection('reviews');

        // carts collection 
        const cartCollection = database.collection('cart');

        // users collection
        const userCollection = database.collection('users');

        // payment history collection 
        const paymentHistoryCollection = database.collection('paymentHistory');

        // middleware
        // verify token middleware
        const verifyToken = (req, res, next) => {
            // console.log("Inside the verify token");
            // console.log("received request:", req?.headers?.authorization);
            if (!req?.headers?.authorization) {
                return res.status(401).json({ message: "Unauthorized Access!" });
            }

            // get token from the headers 
            const token = req?.headers?.authorization;
            // console.log("Received Token", token);

            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) {
                    console.error('JWT Verification Error:', err.message);
                    return res.status(401).json({ message: err.message });
                }
                console.log('Decoded Token:', decoded);
                req.user = decoded;
                next();
            })
        }

        // verify admin middleware after verify token
        const verifyAdmin = async (req, res, next) => {
            const email = req.user.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // verify tourGuide middleware after verify token
        const verifyTourGuide = async (req, res, next) => {
            const email = req.user.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'tourGuide';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // JWT token create and remove APIS
        // JWT token create API 
        app.post('/jwt/create', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7h' });
            res.send({ token })
        })


        // users related APIS 
        // insert user API 
        app.post('/users', async (req, res) => {
            try {
                const user = req.body;
                const existingUser = await userCollection.findOne({ email: user?.email });

                if (existingUser) {
                    const updatedData = {
                        $set: {
                            lastLoginTime: user?.lastLoginTime
                        }
                    };
                    const result = await userCollection.updateOne({ email: user?.email }, updatedData);

                    return res.json({
                        status: false,
                        message: 'User already exists, lastSignInTime updated',
                        data: result
                    });
                }
                const withRole = {
                    ...user, role: "tourist"
                }
                const insertResult = await userCollection.insertOne(withRole);
                res.json({
                    status: true,
                    message: 'User added successfully',
                    data: insertResult
                });


            } catch (error) {
                console.error('Error adding/updating user:', error);
                res.status(500).json({
                    status: false,
                    message: 'Failed to add or update userr',
                    error: error.message
                });
            }
        });

        // delete user form the db API 
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const user = await userCollection.findOne(query);
            const deletedAllCartItems = await cartCollection.deleteMany({ orderer: user?.email })
            const result = await userCollection.deleteOne(query);

            res.json({
                status: true,
                data: result,
                deleted: deletedAllCartItems
            })
        })

        // get all users API 
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.json({
                status: true,
                data: result
            })
        })

        // get all the tourGuide users
        app.get('/tour-guides', async (req, res) => {
            const query = { role: "tourGuide" }
            const result = await userCollection.find(query).toArray()
            res.json({
                status: true,
                data: result
            })
        })

        // get one tour guide user 
        app.get('/tour-guide/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.findOne(query)
            res.json({
                status: true,
                data: result
            })
        })

        // get the all tour guide users API 
        app.get('/users/tourguide', async (req, res) => {
            const query = { role: "tourGuide" }
            const result = await userCollection.find(query).toArray()
            res.json({
                status: true,
                data: result
            })
        })

        // users set admin role API 
        app.patch('/user/admin', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.body.id;
            const body = req.body
            try {
                const query = { _id: new ObjectId(id) };
                const updatedData = {
                    $set: {
                        role: body?.updatedRole,
                    }
                };
                const result = await userCollection.updateOne(query, updatedData);
                res.json({
                    status: true,
                    data: result
                });
            }
            catch (error) {
                console.error('Error updating user role:', error);
                res.status(500).json({
                    status: false,
                    message: 'Failed to update user role',
                    error: error.message
                });
            }
        });

        // get logged user admin, tourGuide or tourist API 
        app.get('/users/role/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.user.email !== email) return res.status(403).json({ message: "unauthorized" });
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let role = null;
            if (user?.role === "admin") {
                role = user?.role;
            }
            if (user?.role === "tourGuide") {
                role = "tourGuide"
            }
            if (user?.role === "tourist") {
                role = "tourist"
            }
            if (email === undefined) {
                role = false
            }
            res.json({
                status: true,
                data: role
            })
        })

        // get one user API 
        app.get('/user/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await userCollection.findOne(query)
            res.json({
                status: true,
                data: result
            })
        })

        // update one user info API 
        app.patch('/user', verifyToken, async (req, res) => {
            const body = req.body
            const id = body?.id
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    name: body?.name,
                }
            }
            console.log(updatedDoc);
            const result = await userCollection.updateOne(query, updatedDoc);
            res.json({
                status: true,
                data: result
            })
        })

        // stripe payment related APIS 
        // stripe payment intent API 
        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            // try {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency: 'usd',
                payment_method_types: ["card"],
            });
            res.json({
                status: true,
                clientSecret: paymentIntent.client_secret,
            })
            // }
            // catch (error) {
            //     // console.error('Error creating payment intent:', error);
            //     res.status(500).json({
            //         status: false,
            //         message: 'Failed to create payment intent',
            //         error: error.message
            //     });
            // }
        });

        // add payment history to the database API 
        app.post('/add-payment-statement', verifyToken, async (req, res) => {

            const paymentData = req.body;
            const result = await paymentHistoryCollection.insertOne(paymentData);

            // carefully remove the the all cart items of specific user 
            const email = req.body.email;
            if (email !== req.user.email) {
                return res.status(401).json({ message: "unauthorized access" });
            }
            // const query = { orderer: email };
            const query = {
                _id: {
                    $in: paymentData?.cartIds?.map(id => new ObjectId(id)),
                }
            }
            const deletedResult = await cartCollection.deleteMany(query);
            res.json({
                status: true,
                insertedResult: result,
                deletedResult
            })
        });

        // get all payment history for specific user API
        app.get('/payment-history/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) {
                return res.status(401).json({ message: "unauthorized access" });
            }
            const query = { email: email };
            const result = await paymentHistoryCollection.find(query).toArray();
            res.json({
                status: true,
                data: result
            })
        });

        // stats and analytics related APIS
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentHistoryCollection.estimatedDocumentCount();

            // this is not the best way 
            // const revenue = await paymentHistoryCollection.find().toArray();
            // const totalRevenue = revenue.reduce((sum, item) => sum + item.totalPrice, 0);

            // this is the best way
            const result = await paymentHistoryCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: "$totalPrice",
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;


            res.json({
                status: true,
                users,
                menuItems,
                orders,
                revenue
            })
        })

        // get the all revenue of each category 
        app.get('/revenue-categories', verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentHistoryCollection.aggregate([
                {
                    $unwind: '$menuItemIds'
                },
                {
                    $addFields: {
                        menuItemId: { $toObjectId: '$menuItemIds' }
                    }
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemId',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: {
                            $sum: 1
                        },
                        revenue: {
                            $sum: '$menuItems.price'
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: 1,
                        revenue: 1
                    }
                }
            ]).toArray();

            res.json({
                status: true,
                data: result
            });
        })



        // tour packages related APIS 
        // tour packages insert API 
        app.post('/packages', verifyToken, verifyAdmin, async (req, res) => {
            const packageBody = req.body
            const result = await tourPackagesCollection.insertOne(packageBody)
            res.json({
                status: true,
                data: result
            })
        })

        // get all the packages from db API 
        app.get('/packages', async (req, res) => {
            const result = await tourPackagesCollection.find().toArray()
            res.json({
                status: true,
                data: result
            })
        })

        // get one package from db API 
        app.get('/package/:id', async (req, res) => {
            const query = { _id: new ObjectId(req.params.id) }
            const result = await tourPackagesCollection.findOne(query)
            res.json({
                status: true,
                data: result
            })
        })


        // tour guide request related APIS 
        // insert the request for tour guide 
        app.post('/tour/guide/request', verifyToken, async (req, res) => {
            const body = req.body
            const result = await TourGuideRequestCollection.insertOne(body)
            res.json({
                status: true,
                data: result
            })
        })

        // get the all request of tour guide API 
        app.get('/tour/guide/requests', verifyToken, verifyAdmin, async (req, res) => {
            const result = await TourGuideRequestCollection.find().toArray()
            res.json({
                status: true,
                data: result
            })
        })

        // accepted as a tour guide API 
        app.patch('/tour/guide/accepted', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const body = req.body;
                const userId = body?.userId;

                if (!ObjectId.isValid(userId)) {
                    return res.json({ status: false, message: "Invalid User ID" });
                }

                // Exclude `_id` from update
                const { _id, ...updateData } = body;

                // Ensure role is updated
                const userUpdatedDoc = {
                    $set: { ...updateData, role: "tourGuide" }
                };

                // Update the user collection
                const userDataUpdated = await userCollection.updateOne(
                    { _id: new ObjectId(String(userId)) },
                    userUpdatedDoc
                );

                if (userDataUpdated.modifiedCount === 0) {
                    return res.json({ status: false, message: "User update failed" });
                }

                // delete from the request collection 
                const deleteRequest = await TourGuideRequestCollection.deleteOne({ _id: new ObjectId(_id) })

                res.json({
                    status: true,
                    message: "Accepted",
                    userId,
                    userDataUpdated,
                    deleteRequest
                });
            } catch (error) {
                console.error("Error:", error);
                res.json({
                    status: false,
                    message: "Internal server error"
                });
            }
        });

        // rejected a tour guide request API 
        app.delete('/tour/guide/rejected/:id', async (req, res) => {
            const id = req.params.id
            const result = await TourGuideRequestCollection.deleteOne({ _id: new ObjectId(id) })
            res.json({
                status: true,
                result,
                message: "Request Successfully Deleted "
            })
        })



        // booking tour related APIS 
        // insert an tour booking API 


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', async (req, res) => {
    res.json({
        status: true,
        message: "Traventure Server Run Status OK"
    });
})

app.listen(port, () => {
    console.log("Traventure server Running on port ", port);
})