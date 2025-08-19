import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";



dotenv.config();

export const register = async (req, res) => {
    try {
        const {name, email, password} = req.body;
        if(!email || !password || !name) {
            return res.status(400).json({
                success : false,
                message : "Please enter all fields"

            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);



        const user = await User.findOne({
            where: {
                email: email
            }
        })

        if(user){
            return res.status(400).json({
                success : false,
                message : "User already exists"
            })

        }

        const newUser = await User.create({
            name: name,
            email : email,
            password: hashedPassword
        })

        if(!newUser){
            return res.status(400).json({
                success : false,
                message: "Failed to create user"

            })
        }

        const token = jwt.sign({id: newUser._id}, process.env.JWTSECRET_KEY, {expiresIn: "7d"});

        const cookiesOption = {
            httpOnly: true,
            expires: new Date(Date.now() + 7 * 24 * 60 * 60*1000),
            secure : true,
            sameSite: "Lax"
            // sameSite : "None",
            // domain : ".vercel.app"
        }

        res.cookie("token", token , cookiesOption);

        
        return res.status(201).json({
            success : true,
            message: "User created successfully",
            token: token,
            
            user : {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                
            }
        })


        
    } catch (error) {
        console.error(error);
       return  res.status(500).json({
            success: false,
            message: "Internal server error while creating user"
        })
        
    }
}
export const login = async (req, res) => {
     try {
        const {email, password} = req.body;

        if(!email || !password){
            return res.status(400).json({
                success : false,
                message: "Please provide email and password"
            })
        }

        const user = await User.findOne({email: email});  
        
        if(!user){
            return res.status(401).json({
                success : false,
                message: "Wrong Credentials"
            })
        }

        

        const isMatch = await bcrypt.compare(password,user.password);

        if(!isMatch){
           return res.status(400).json({
                success : false , 
                message : "Wrong Credentials"
            })
        }

        
         const token = jwt.sign({id: user._id}, process.env.JWTSECRET_KEY, {expiresIn: "7d"});

        const cookiesOption = {
            httpOnly: true,
            expires: new Date(Date.now() + 7 * 24 * 60 * 60*1000),
            secure : true,
            sameSite : "Lax"
            // sameSite : "None",
            // domain: ".vercel.app"
        }

        res.cookie("token", token , cookiesOption);

       
       return res.status(201).json({
            success : true,
            message: "Login successfully",
            token: token,
            
            user : {
                id: user._id,
                name: user.name,
                email: user.email,
                role : user.role
            }
        })


        

        
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success : false ,
            message : "Internal Server Error while login" 
        })
        
    }
}
export const getMe = async (req, res) => {
     try {
        if(!req.user){
            return res.status(401).json({
                success : false ,
                message : "Unauthorized"
            })
            
        }

        return res.status(200).json({
            success : true ,
            user : req.user
        })

    }catch(error){
        console.log(error);
        return res.status(500).json({
            success : false ,
            message : "Internal server error while getting user data"
        })
    }
    
}
export const logout = async (req, res) => {
     try {
        
        res.clearCookie("token");
        
        return res.status(200).json({
            success : true ,
            message : "Logged out successfully"
        })
        
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success : false ,
            message : "Internal server error while logging out"
        })
        
    }

}
