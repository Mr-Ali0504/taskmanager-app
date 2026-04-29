// =============================================================================
// Jenkinsfile — Declarative Pipeline
// Reference: https://www.jenkins.io/doc/book/pipeline/syntax/
//
// This pipeline automates the full CI/CD lifecycle for the TaskFlow app:
//   1. Checkout  — pull code from GitHub
//   2. Test      — run backend unit tests
//   3. Build     — build Docker images for backend and frontend
//   4. Push      — push images to Docker Hub (or ECR)
//   5. Deploy Dev       — deploy automatically to the dev environment
//   6. Deploy Staging   — requires manual approval
//   7. Deploy Prod      — requires manual approval
//
// PIPELINE TYPE: Declarative (easier to read/write than Scripted pipelines)
// =============================================================================

pipeline {

    // 'agent any' means: run this pipeline on any available Jenkins agent
    // Later we can change this to 'agent { label 'docker' }' to use our specific agent
    agent any

    // ─── Environment Variables ─────────────────────────────────────────────────
    // These are available to all stages as environment variables
    environment {
        // AWS ECR Registry configuration
        AWS_ACCOUNT_ID   = '289127796650'
        AWS_REGION       = 'eu-north-1'
        ECR_REGISTRY     = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

        // Image names — will be tagged as registry/repo:version
        BACKEND_IMAGE    = "${ECR_REGISTRY}/taskmanager-backend"
        FRONTEND_IMAGE   = "${ECR_REGISTRY}/taskmanager-frontend"

        // Image tag — uses the Jenkins build number for versioning
        // e.g., build #42 produces tag '42'
        IMAGE_TAG        = "${env.BUILD_NUMBER}"

        // Target servers for deployment
        // We are using the Agent instance as our "Dev" environment for now
        DEV_SERVER_IP    = '13.61.10.174'
        STAGING_SERVER_IP = '13.61.10.174' // Using same for lab
        PROD_SERVER_IP   = '13.61.10.174' // Using same for lab

        // SSH credentials for deploying to EC2 (stored in Jenkins)
        EC2_SSH_KEY      = credentials('ec2-ssh-key')
    }

    // ─── Triggers ──────────────────────────────────────────────────────────────
    triggers {
        // Automatically trigger a build whenever code is pushed to the 'main' branch
        // This requires the GitHub webhook to be configured
        pollSCM('H/5 * * * *')  // Poll GitHub every 5 minutes as a fallback
    }

    // ─── Stages ────────────────────────────────────────────────────────────────
    stages {

        // ── Stage 1: Checkout ─────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                // Pull the latest code from the GitHub repository
                // Jenkins automatically checks out the branch that triggered the build
                checkout scm
                echo "✅ Code checked out. Branch: ${env.BRANCH_NAME}, Build: #${env.BUILD_NUMBER}"
            }
        }

        // ── Stage 2: Test ─────────────────────────────────────────────────────
        stage('Test Backend') {
            steps {
                dir('backend') {
                    // Install dependencies and run tests
                    // 'sh' runs shell commands on the agent
                    sh 'npm install'
                    sh 'npm test'
                }
            }
            post {
                // 'always' block runs whether the stage succeeded or failed
                always {
                    // Publish test results to Jenkins for the Test Results view
                    // Reference: https://www.jenkins.io/doc/pipeline/steps/junit/
                    junit allowEmptyResults: true, testResults: 'backend/junit.xml'
                }
            }
        }

        // ── Stage 3: Build Docker Images ──────────────────────────────────────
        stage('Build Images') {
            steps {
                script {
                    echo "🔨 Building Docker images with tag: ${IMAGE_TAG}"

                    // Build backend image using the 'production' stage of the Dockerfile
                    sh """
                        docker build \
                            --target production \
                            -t ${BACKEND_IMAGE}:${IMAGE_TAG} \
                            -t ${BACKEND_IMAGE}:latest \
                            ./backend
                    """

                    // Build frontend image, injecting the backend API URL
                    sh """
                        docker build \
                            --target production \
                            --build-arg VITE_API_URL=http://your-backend-ip:5000 \
                            -t ${FRONTEND_IMAGE}:${IMAGE_TAG} \
                            -t ${FRONTEND_IMAGE}:latest \
                            ./frontend
                    """
                }
            }
        }

        // ── Stage 4: Push to Registry ─────────────────────────────────────────
        stage('Push Images') {
            steps {
                script {
                    echo "📦 Pushing images to AWS ECR"

                    // Use AWS Credentials stored in Jenkins
                    // Ensure you create a "Username with password" credential in Jenkins
                    // Username = AWS Access Key ID, Password = AWS Secret Access Key
                    withCredentials([usernamePassword(credentialsId: 'aws-credentials', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                        // Login to AWS ECR using the AWS CLI
                        sh "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}"

                        sh "docker push ${BACKEND_IMAGE}:${IMAGE_TAG}"
                        sh "docker push ${BACKEND_IMAGE}:latest"
                        sh "docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}"
                        sh "docker push ${FRONTEND_IMAGE}:latest"
                    }
                }
            }
        }

        // ── Stage 5: Deploy to Dev (automatic) ────────────────────────────────
        stage('Deploy to Dev') {
            steps {
                script {
                    echo "🚀 Deploying to DEV environment"
                    // SSH into the dev server and pull + restart the containers
                    sh """
                        ssh -o StrictHostKeyChecking=no -i ${EC2_SSH_KEY} ubuntu@${DEV_SERVER_IP} '
                            cd /opt/taskmanager
                            export IMAGE_TAG=${IMAGE_TAG}
                            docker-compose pull
                            docker-compose up -d
                            docker system prune -f
                        '
                    """
                }
            }
        }

        // ── Stage 6: Deploy to Staging (manual approval required) ─────────────
        stage('Deploy to Staging') {
            // 'when' controls if this stage runs at all
            when {
                // Only run for the 'main' branch (not feature branches)
                branch 'main'
            }
            steps {
                // 'input' pauses the pipeline and waits for a human to click OK
                // Reference: https://www.jenkins.io/doc/pipeline/steps/pipeline-input-step/
                input message: '🛑 Deploy to STAGING? Review Dev results first.', ok: 'Deploy to Staging'

                script {
                    echo "🚀 Deploying to STAGING environment"
                    sh """
                        ssh -o StrictHostKeyChecking=no -i ${EC2_SSH_KEY} ubuntu@${STAGING_SERVER_IP} '
                            cd /opt/taskmanager
                            export IMAGE_TAG=${IMAGE_TAG}
                            docker-compose pull
                            docker-compose up -d
                        '
                    """
                }
            }
        }

        // ── Stage 7: Deploy to Production (manual approval required) ──────────
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                input message: '🚨 Deploy to PRODUCTION? This affects real users!', ok: 'Deploy to Production'

                script {
                    echo "🚀 Deploying to PRODUCTION environment"
                    sh """
                        ssh -o StrictHostKeyChecking=no -i ${EC2_SSH_KEY} ubuntu@${PROD_SERVER_IP} '
                            cd /opt/taskmanager
                            export IMAGE_TAG=${IMAGE_TAG}
                            docker-compose pull
                            docker-compose up -d
                        '
                    """
                }
            }
        }

    } // end stages

    // ─── Post Actions ──────────────────────────────────────────────────────────
    // These run after all stages complete, regardless of success or failure
    post {
        success {
            echo "✅ Pipeline completed successfully! Build #${env.BUILD_NUMBER}"
            // In a real project, you would send a Slack/email notification here
        }
        failure {
            echo "❌ Pipeline FAILED at stage. Check logs above."
            // Notify the team here
        }
        always {
            // Clean up Docker images from the agent to save disk space
            sh 'docker logout || true'
        }
    }

} // end pipeline
