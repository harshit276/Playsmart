#!/usr/bin/env python3
"""
PlaySmart Backend API Comprehensive Testing
Tests all backend endpoints for the badminton companion app
"""

import requests
import json
import sys
from datetime import datetime
import uuid

class PlaySmartAPITester:
    def __init__(self, base_url="https://smart-racket-guide.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_phone = "9876543210"
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token and not (headers and 'Authorization' in headers):
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        self.log(f"   URL: {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"   ✅ PASS - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                self.log(f"   ❌ FAIL - Expected {expected_status}, got {response.status_code}")
                self.log(f"   Response: {response.text[:200]}")
                return False, {}

        except requests.exceptions.Timeout:
            self.log(f"   ❌ FAIL - Request timeout")
            return False, {}
        except Exception as e:
            self.log(f"   ❌ FAIL - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test basic health endpoints"""
        self.log("\n=== HEALTH CHECK TESTS ===")
        
        success, _ = self.run_test("Health Check", "GET", "health", 200)
        if not success:
            self.log("❌ Critical: Health check failed")
            return False
            
        success, data = self.run_test("Root Endpoint", "GET", "", 200)
        if success and 'PlaySmart API' in str(data):
            self.log("✅ Root endpoint returns correct API name")
        return success

    def test_otp_flow(self):
        """Test complete OTP authentication flow"""
        self.log("\n=== OTP AUTHENTICATION TESTS ===")
        
        # Test send OTP
        success, response = self.run_test(
            "Send OTP",
            "POST", 
            "auth/send-otp",
            200,
            {"phone": self.test_phone}
        )
        
        if not success:
            self.log("❌ Critical: OTP send failed")
            return False
            
        otp = response.get('otp_hint')
        if not otp:
            self.log("❌ Critical: No OTP hint in response")
            return False
            
        self.log(f"   📱 OTP received: {otp}")
        
        # Test verify OTP
        success, response = self.run_test(
            "Verify OTP",
            "POST",
            "auth/verify-otp", 
            200,
            {"phone": self.test_phone, "otp": str(otp)}
        )
        
        if not success:
            self.log("❌ Critical: OTP verification failed")
            return False
            
        self.token = response.get('token')
        user_data = response.get('user', {})
        self.user_id = user_data.get('id')
        has_profile = response.get('has_profile', False)
        
        if not self.token:
            self.log("❌ Critical: No token in verify response")
            return False
            
        self.log(f"   🔑 Token received: {self.token[:20]}...")
        self.log(f"   👤 User ID: {self.user_id}")
        self.log(f"   📋 Has profile: {has_profile}")
        
        return True

    def test_profile_flow(self):
        """Test profile creation and retrieval"""
        self.log("\n=== PROFILE MANAGEMENT TESTS ===")
        
        # Test get current user
        success, response = self.run_test("Get Current User", "GET", "auth/me", 200)
        if not success:
            return False
            
        # Create profile
        profile_data = {
            "skill_level": "Intermediate",
            "play_style": "All-round", 
            "playing_frequency": "3-4 days/week",
            "budget_range": "Medium",
            "injury_history": "none",
            "primary_goal": "Consistency"
        }
        
        success, response = self.run_test(
            "Create Profile",
            "POST",
            "profile",
            200,
            profile_data
        )
        
        if not success:
            return False
            
        profile = response.get('profile', {})
        if not profile:
            self.log("❌ No profile in response")
            return False
            
        self.log(f"   📊 Profile created: {profile.get('skill_level')} {profile.get('play_style')}")
        
        # Test get profile by ID
        success, response = self.run_test(
            "Get Profile by ID",
            "GET", 
            f"profile/{self.user_id}",
            200
        )
        
        return success

    def test_equipment_endpoints(self):
        """Test equipment listing and recommendations"""
        self.log("\n=== EQUIPMENT TESTS ===") 
        
        # Test list all equipment
        success, response = self.run_test("List All Equipment", "GET", "equipment", 200)
        if not success:
            return False
            
        equipment_list = response.get('equipment', [])
        total = response.get('total', 0)
        self.log(f"   📦 Total equipment: {total}")
        
        # Test filter by category 
        success, response = self.run_test("List Rackets", "GET", "equipment?category=racket", 200)
        if success:
            racket_count = response.get('total', 0)
            self.log(f"   🎾 Rackets: {racket_count}")
        
        # Test equipment recommendations
        success, response = self.run_test(
            "Equipment Recommendations",
            "GET", 
            f"recommendations/equipment/{self.user_id}",
            200
        )
        
        if not success:
            return False
            
        recommendations = response.get('recommendations', [])
        profile_summary = response.get('profile_summary', {})
        
        self.log(f"   🎯 Recommendations: {len(recommendations)}")
        self.log(f"   👤 Profile: {profile_summary.get('skill_level')} {profile_summary.get('play_style')}")
        
        # Verify top recommendation has required fields
        if recommendations:
            top_rec = recommendations[0]
            equipment = top_rec.get('equipment', {})
            score = top_rec.get('score', {})
            
            required_eq_fields = ['id', 'brand', 'model', 'category']
            required_score_fields = ['total', 'skill_match', 'play_style_match']
            
            for field in required_eq_fields:
                if field not in equipment:
                    self.log(f"   ❌ Missing equipment field: {field}")
                    return False
                    
            for field in required_score_fields:
                if field not in score:
                    self.log(f"   ❌ Missing score field: {field}")
                    return False
                    
            self.log(f"   🏆 Top recommendation: {equipment.get('brand')} {equipment.get('model')} (Score: {score.get('total')})")
        
        return True

    def test_training_endpoints(self):
        """Test training plan and drill endpoints"""
        self.log("\n=== TRAINING TESTS ===")
        
        # Test get training recommendation
        success, response = self.run_test(
            "Training Recommendation", 
            "GET",
            f"recommendations/training/{self.user_id}",
            200
        )
        
        if not success:
            return False
            
        plan = response.get('plan', {})
        if not plan:
            self.log("❌ No training plan in response")
            return False
            
        self.log(f"   📚 Plan: {plan.get('name')} ({plan.get('level')})")
        self.log(f"   📅 Duration: {plan.get('duration_days')} days")
        
        weeks = plan.get('weeks', [])
        if weeks:
            self.log(f"   📖 Weeks: {len(weeks)}")
            
        # Test list drills
        success, response = self.run_test("List All Drills", "GET", "drills", 200)
        if not success:
            return False
            
        drills = response.get('drills', [])
        total_drills = response.get('total', 0)
        self.log(f"   🏃 Total drills: {total_drills}")
        
        # Test drill filtering
        success, response = self.run_test(
            "Filter Drills by Skill",
            "GET", 
            "drills?skill_focus=Footwork",
            200
        )
        
        if success:
            footwork_drills = response.get('total', 0)
            self.log(f"   👟 Footwork drills: {footwork_drills}")
        
        return True

    def test_progress_tracking(self):
        """Test progress tracking functionality"""
        self.log("\n=== PROGRESS TRACKING TESTS ===")
        
        # Test get initial progress
        success, response = self.run_test(
            "Get Initial Progress",
            "GET",
            f"progress/{self.user_id}",
            200
        )
        
        if not success:
            return False
            
        completed_days = response.get('completed_days', 0)
        total_days = response.get('total_days', 30)
        current_streak = response.get('current_streak', 0)
        
        self.log(f"   📊 Progress: {completed_days}/{total_days} days")
        self.log(f"   🔥 Streak: {current_streak} days")
        
        # Test mark day complete
        test_plan_id = str(uuid.uuid4())
        test_day = 1
        
        success, response = self.run_test(
            "Mark Day Complete",
            "POST",
            "progress",
            200,
            {"plan_id": test_plan_id, "day": test_day}
        )
        
        if not success:
            return False
            
        message = response.get('message', '')
        completed = response.get('completed', False)
        
        self.log(f"   ✅ Day marked: {message} (completed: {completed})")
        
        # Test toggle (mark incomplete)
        success, response = self.run_test(
            "Toggle Day Incomplete",
            "POST", 
            "progress",
            200,
            {"plan_id": test_plan_id, "day": test_day}
        )
        
        if success:
            message = response.get('message', '')
            completed = response.get('completed', False)
            self.log(f"   🔄 Day toggled: {message} (completed: {completed})")
        
        return success

    def test_player_card(self):
        """Test player card generation"""
        self.log("\n=== PLAYER CARD TESTS ===")
        
        success, response = self.run_test(
            "Generate Player Card",
            "GET",
            f"player-card/{self.user_id}",
            200
        )
        
        if not success:
            return False
            
        card = response.get('card', {})
        if not card:
            self.log("❌ No card data in response")
            return False
            
        required_fields = ['skill_level', 'play_style', 'primary_goal', 'strengths', 'focus_areas']
        for field in required_fields:
            if field not in card:
                self.log(f"❌ Missing card field: {field}")
                return False
                
        self.log(f"   🎴 Card generated for: {card.get('skill_level')} {card.get('play_style')}")
        self.log(f"   💪 Strengths: {len(card.get('strengths', []))}")
        self.log(f"   🎯 Focus areas: {len(card.get('focus_areas', []))}")
        
        if card.get('recommended_racket'):
            self.log(f"   🎾 Recommended: {card.get('recommended_racket')}")
            
        return True

    def test_error_handling(self):
        """Test API error responses"""
        self.log("\n=== ERROR HANDLING TESTS ===")
        
        # Test unauthorized request
        success, _ = self.run_test(
            "Unauthorized Request",
            "GET", 
            "auth/me",
            401,
            headers={'Authorization': 'Bearer invalid_token'}
        )
        
        # Test invalid OTP
        success, _ = self.run_test(
            "Invalid OTP",
            "POST",
            "auth/verify-otp",
            400,
            {"phone": self.test_phone, "otp": "000000"}
        )
        
        # Test invalid phone format
        success, _ = self.run_test(
            "Invalid Phone Format",
            "POST",
            "auth/send-otp", 
            400,
            {"phone": "123"}
        )
        
        # Test nonexistent user profile
        fake_user_id = str(uuid.uuid4())
        success, _ = self.run_test(
            "Nonexistent User Profile",
            "GET",
            f"profile/{fake_user_id}",
            404
        )
        
        return True

    def run_all_tests(self):
        """Run complete test suite"""
        self.log("🚀 Starting PlaySmart API Test Suite")
        self.log(f"Base URL: {self.base_url}")
        self.log(f"Test Phone: {self.test_phone}")
        
        test_results = {
            'health_check': self.test_health_check(),
            'otp_flow': self.test_otp_flow(),
            'profile_flow': self.test_profile_flow(),
            'equipment': self.test_equipment_endpoints(),
            'training': self.test_training_endpoints(),
            'progress': self.test_progress_tracking(),
            'player_card': self.test_player_card(),
            'error_handling': self.test_error_handling()
        }
        
        # Summary
        self.log("\n" + "="*50)
        self.log("📊 TEST RESULTS SUMMARY")
        self.log("="*50)
        
        passed_tests = sum(test_results.values())
        total_test_categories = len(test_results)
        
        for category, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{status} {category.replace('_', ' ').title()}")
        
        self.log(f"\nOverall Results:")
        self.log(f"✅ Test Categories Passed: {passed_tests}/{total_test_categories}")
        self.log(f"✅ Individual Tests Passed: {self.tests_passed}/{self.tests_run}")
        self.log(f"📈 Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Determine exit code
        critical_tests = ['health_check', 'otp_flow', 'profile_flow']
        critical_passed = all(test_results[test] for test in critical_tests)
        
        if not critical_passed:
            self.log("\n❌ CRITICAL TESTS FAILED - App may not be functional")
            return 1
        elif passed_tests == total_test_categories:
            self.log("\n🎉 ALL TESTS PASSED - API is fully functional!")
            return 0
        else:
            self.log(f"\n⚠️  Some tests failed but core functionality works")
            return 0


def main():
    tester = PlaySmartAPITester()
    return tester.run_all_tests()


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)